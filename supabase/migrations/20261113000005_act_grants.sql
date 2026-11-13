-- Uỷ quyền đóng vai có thời hạn: admin làm thay một người (hoặc tất cả) trong khoảng thời gian
create table if not exists public.act_grants (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid references public.profiles(id) on delete cascade, -- null = tất cả người dùng
  from_at timestamptz not null, to_at timestamptz not null, reason text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid,
  check (to_at > from_at)
);
create index if not exists act_grants_admin on public.act_grants(admin_id, to_at);
alter table public.act_grants enable row level security;
drop policy if exists act_grants_read on public.act_grants;
create policy act_grants_read on public.act_grants for select to authenticated using (public.is_real_admin() or admin_id = auth.uid() or target_id = auth.uid());

-- Giấy uỷ quyền đang hiệu lực cho người thật (auth.uid) làm thay p_target
create or replace function public._act_grant(p_target uuid) returns public.act_grants language sql stable security definer set search_path = public as $$
  select * from act_grants where admin_id = auth.uid() and revoked_at is null and now() between from_at and to_at
    and (target_id is null or target_id = p_target) order by (target_id is null), to_at desc limit 1;
$$;

-- Người dùng hiệu lực: admin IT đang đóng vai, hoặc người có giấy uỷ quyền còn hạn
create or replace function public.app_uid() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.impersonating from profiles p where p.id = auth.uid() and p.active and p.impersonating is not null
       and ('admin_it' = any(p.roles) or (public._act_grant(p.impersonating)).id is not null)),
    auth.uid());
$$;

-- Trạng thái làm thay hiện tại (cho app hiển thị / khoá nút)
create or replace function public.act_status() returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.impersonating is null then null else jsonb_build_object('target', p.impersonating,
    'until', (public._act_grant(p.impersonating)).to_at, 'reason', (public._act_grant(p.impersonating)).reason) end
  from profiles p where p.id = auth.uid();
$$;

create or replace function public.start_impersonation(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare g act_grants;
begin
  g := _act_grant(p_user);
  if not is_real_admin() and g.id is null then raise exception 'Bạn chưa được uỷ quyền làm thay người này (hoặc đã hết hạn)'; end if;
  if p_user = auth.uid() then raise exception 'Không thể đóng vai chính mình'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'Người dùng không tồn tại hoặc đã khoá'; end if;
  update profiles set impersonating = p_user where id = auth.uid();
  insert into audit_log(actor, acting_as, table_name, action, detail) values (auth.uid(), p_user, 'event',
    case when g.id is null then 'Bắt đầu đăng nhập với tư cách (chỉ xem đơn thật)' else 'Bắt đầu làm thay theo uỷ quyền' end,
    jsonb_build_object('grant', g.id, 'until', g.to_at));
end $$;

-- Được thao tác thật khi đang đóng vai? (giấy uỷ quyền còn hạn, hoặc đơn [TEST]/[MẪU])
create or replace function public._act_ok(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.app_uid() = auth.uid() or (public._act_grant(public.app_uid())).id is not null
    or exists (select 1 from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
               where d.id = p_doc and o.project ~* '^\s*\[(MẪU|MAU|TEST)\]');
$$;

create or replace function public.can_act(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public._act_ok(p_doc) and coalesce((select case
      when has_role('admin_it') then true
      when d.assignee is not null then d.assignee = any(my_ids())
      when d.status = 'duyet_them' then exists (select 1 from approval_levels l
        where l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid and in_any(l.user_id, l.group_id))
      else _is_person(b.proc, d.company, _role_of(b.proc, d.status)) end
    from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.status = 'dang_lam'), false);
$$;

-- Chữ ký ghi người thật khi làm thay
create or replace function public._sign_by() returns trigger language plpgsql security definer set search_path = public as $$
declare n int := jsonb_array_length(coalesce(new.signs, '[]')); o int := jsonb_array_length(coalesce(old.signs, '[]'));
begin
  if n > o and auth.uid() is not null and public.app_uid() is distinct from auth.uid() then
    new.signs := jsonb_set(new.signs, array[(n - 1)::text, 'by'], to_jsonb(auth.uid()));
  end if;
  return new;
end $$;
drop trigger if exists docs_sign_by on public.docs;
create trigger docs_sign_by before update of signs on public.docs for each row execute function public._sign_by();

create or replace function public.act_grant_add(p_admin uuid, p_target uuid, p_from timestamptz, p_to timestamptz, p_reason text) returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; an text;
begin
  if not is_real_admin() then raise exception 'Chỉ IT quản trị được cấp uỷ quyền'; end if;
  if p_to <= p_from then raise exception 'Thời gian kết thúc phải sau thời gian bắt đầu'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Ghi lý do uỷ quyền'; end if;
  if not exists (select 1 from profiles where profiles.id = p_admin and active and roles && array['admin_it','admin_cnc']) then raise exception 'Người được uỷ quyền phải là admin'; end if;
  if p_target = p_admin then raise exception 'Không uỷ quyền làm thay chính mình'; end if;
  insert into act_grants(admin_id, target_id, from_at, to_at, reason) values (p_admin, p_target, p_from, p_to, trim(p_reason)) returning act_grants.id into id;
  select full_name into an from profiles where profiles.id = p_admin;
  insert into audit_log(actor, table_name, action, detail) values (auth.uid(), 'act_grants', 'Cấp uỷ quyền làm thay',
    jsonb_build_object('grant', id, 'admin', p_admin, 'target', p_target, 'from', p_from, 'to', p_to, 'reason', p_reason));
  if p_target is not null then
    perform _zsend(array[p_target], '🔐 Uỷ quyền làm thay' || E'\n' || an || ' được làm thay bạn trong app PMS' || E'\nTừ ' ||
      to_char(p_from at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' đến ' || to_char(p_to at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || E'\nLý do: ' || trim(p_reason));
  end if;
  return id;
end $$;

create or replace function public.act_grant_revoke(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_real_admin() then raise exception 'Chỉ IT quản trị được huỷ uỷ quyền'; end if;
  update act_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_id and revoked_at is null;
  insert into audit_log(actor, table_name, action, detail) values (auth.uid(), 'act_grants', 'Huỷ uỷ quyền làm thay', jsonb_build_object('grant', p_id));
end $$;
revoke execute on function public.act_grant_add(uuid, uuid, timestamptz, timestamptz, text), public.act_grant_revoke(uuid) from public, anon;
grant execute on function public.act_grant_add(uuid, uuid, timestamptz, timestamptz, text), public.act_grant_revoke(uuid), public.act_status() to authenticated;
