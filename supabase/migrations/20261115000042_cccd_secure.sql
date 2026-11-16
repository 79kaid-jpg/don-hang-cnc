-- QT3 · CCCD tài xế: mã hoá số CCCD, chỉ hiện dạng che; xem đầy đủ qua reveal_cccd (có ghi nhật ký);
-- ảnh CCCD gốc chỉ người có quyền tải được (người khác xem bản làm mờ <path>.blur.jpg)
create extension if not exists pgcrypto with schema extensions;

insert into app_secrets(name, value, provider)
  select 'CCCD_KEY', encode(extensions.gen_random_bytes(32), 'hex'), 'system'
  where not exists (select 1 from app_secrets where name = 'CCCD_KEY');

create table if not exists doc_cccd (doc_id uuid primary key references docs(id) on delete cascade, enc bytea not null, masked text not null, updated_at timestamptz not null default now());
alter table doc_cccd enable row level security; -- không có policy: chỉ hàm security definer đọc/ghi
create table if not exists cccd_views (id bigserial primary key, doc_id uuid not null, viewer uuid, at timestamptz not null default now());
alter table cccd_views enable row level security;
create policy "IT xem nhật ký CCCD" on cccd_views for select using (has_role('admin_it'));

create or replace function public.cccd_mask(p text) returns text language sql immutable as $$
  select case when length(p) > 7 then left(p, 3) || repeat('•', length(p) - 7) || right(p, 4) else repeat('•', length(p)) end $$;

create or replace function public.cccd_ok(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(can_act(p_doc), false) or has_role('admin_it') or has_role('admin_cnc') or has_role('kho_qc') $$;

-- Trước khi lưu phiếu: số CCCD dạng thường → mã hoá vào doc_cccd, phiếu chỉ giữ số đã che
create or replace function public._docs_cccd() returns trigger language plpgsql security definer set search_path = public as $$
declare v text := regexp_replace(coalesce(new.header->>'tx_cccd', ''), '\s', '', 'g'); k text;
begin
  if v ~ '^[0-9]{6,15}$' then
    select value into k from app_secrets where name = 'CCCD_KEY';
    insert into doc_cccd(doc_id, enc, masked) values (new.id, extensions.pgp_sym_encrypt(v, k), cccd_mask(v))
      on conflict (doc_id) do update set enc = excluded.enc, masked = excluded.masked, updated_at = now();
    new.header := jsonb_set(new.header, '{tx_cccd}', to_jsonb(cccd_mask(v)));
  elsif v = '' and tg_op = 'UPDATE' and coalesce(old.header->>'tx_cccd', '') <> '' then
    delete from doc_cccd where doc_id = new.id;
  end if;
  if new.ret_snap ? 'header' and coalesce(new.ret_snap->'header'->>'tx_cccd', '') ~ '[0-9]{6}' then
    new.ret_snap := jsonb_set(new.ret_snap, '{header,tx_cccd}', to_jsonb(cccd_mask(regexp_replace(new.ret_snap->'header'->>'tx_cccd', '\s', '', 'g'))));
  end if;
  return new;
end $$;
drop trigger if exists docs_cccd on docs;
create trigger docs_cccd before insert or update of header, ret_snap on docs for each row execute function _docs_cccd();

create or replace function public.reveal_cccd(p_doc uuid) returns text language plpgsql security definer set search_path = public as $$
declare r doc_cccd; k text;
begin
  if not cccd_ok(p_doc) then raise exception 'Bạn không có quyền xem số CCCD'; end if;
  select * into r from doc_cccd where doc_id = p_doc; if r.doc_id is null then return null; end if;
  select value into k from app_secrets where name = 'CCCD_KEY';
  insert into cccd_views(doc_id, viewer) values (p_doc, app_uid());
  return extensions.pgp_sym_decrypt(r.enc, k);
end $$;
revoke all on function public.reveal_cccd(uuid) from public, anon; grant execute on function public.reveal_cccd(uuid) to authenticated;
grant execute on function public.cccd_ok(uuid) to authenticated;

-- Ảnh CCCD gốc: chỉ người có quyền; bản làm mờ (.blur.jpg) theo quyền thường
create or replace function public.file_visible(p_name text) returns boolean language plpgsql stable security definer set search_path = public as $function$
declare seg text[] := string_to_array(p_name, '/'); r doc_records; pr text; cd uuid;
begin
  if is_adm() then return true; end if;
  if seg[1] = 'records' then
    select * into r from doc_records where path = p_name limit 1;
    return r.id is null or rec_visible2(r.doc_id, r.kind, r.proc, r.company, r.has_secret);
  end if;
  if cardinality(seg) >= 4 and seg[3] in ('PN', 'IPC', 'HW') then
    select proc into pr from batches where id::text = seg[2];
    if pr is not null and not doc_visible(seg[3], pr) then return false; end if;
    if p_name !~ '\.blur\.jpg$' then
      select id into cd from docs where batch_id::text = seg[2] and files @> jsonb_build_array(jsonb_build_object('path', p_name, 'kind', 'gh_cccd')) limit 1;
      if cd is not null then return cccd_ok(cd); end if;
    end if;
    return true;
  end if;
  return true;
end $function$;

-- Phiếu cũ đang lưu số thường → mã hoá
update docs set header = header where header->>'tx_cccd' ~ '[0-9]{6}';
