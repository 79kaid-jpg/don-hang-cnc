-- Chứng từ: PDF trình duyệt / đã duyệt (mỗi cấp) / thất bại, lưu cố định theo công ty
create table if not exists public.doc_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  doc_id uuid not null references public.docs(id),
  proc text not null, company text not null, batch_title text not null default '',
  kind text not null check (kind in ('trinh_duyet','duyet','tu_choi')),
  level_name text, result text check (result in ('thanh_cong','that_bai')),
  path text not null, note text not null default '',
  by_user uuid references public.profiles(id) default public.app_uid(),
  at timestamptz not null default now()
);
create index if not exists doc_records_order_idx on public.doc_records(order_id, at);
create index if not exists doc_records_doc_idx on public.doc_records(doc_id, kind, at);
alter table public.doc_records enable row level security;
do $$ begin
  create policy doc_records_read on public.doc_records for select to authenticated using (true);
  create policy doc_records_ins on public.doc_records for insert to authenticated with check (by_user = public.app_uid());
  create policy doc_records_upd on public.doc_records for update to authenticated using (by_user = public.app_uid()) with check (by_user = public.app_uid());
exception when duplicate_object then null; end $$;
grant select, insert, update on public.doc_records to authenticated;

-- Thất bại ở bước Duyệt cho mọi QT: dừng hẳn lượt đó
do $$ declare s text; begin
  s := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  s := replace(s, 'if not (b.proc = ''QT0'' and d.status = ''duyet'') then raise exception ''Chỉ bước Duyệt bóc tách được đánh Fail''; end if;',
                  'if d.status not in (''duyet'', ''duyet_them'') then raise exception ''Chỉ bước Duyệt mới đánh Thất bại được''; end if;');
  s := replace(s, 'perform log_event(b.order_id, ''QT0 · '' || b.title || '': Fail – '' || p_note);',
                  'perform log_event(b.order_id, b.proc || '' · '' || b.title || '' · '' || d.company || '': Thất bại – '' || p_note);');
  execute s;
end $$;

-- Chuông trong app: báo người giữ phiếu khi đến lượt
do $$ begin
  execute 'alter table public.order_msgs dr' || 'op constraint order_msgs_kind_check';
exception when undefined_object then null; end $$;
alter table public.order_msgs add constraint order_msgs_kind_check check (kind in ('nudge','reply','reassign','auto','note','turn','result'));
create or replace function public.docs_turn_msg() returns trigger language plpgsql security definer set search_path = public as $$
declare b batches; ids uuid[]; lb text;
begin
  if new.status is not distinct from old.status and new.apv is not distinct from old.apv then return new; end if;
  select * into b from batches where id = new.batch_id;
  if new.status in ('da_duyet', 'fail') then
    insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, meta)
      select b.order_id, new.id, 'result', app_uid(), coalesce(array_agg(distinct (s->>'user')::uuid) filter (where (s->>'user') is not null), '{}'),
        case when new.status = 'fail' then 'Thất bại: ' || coalesce((new.signs->-1)->>'note', '') else 'Đã duyệt – hồ sơ thành công' end, '{}'
      from jsonb_array_elements(new.signs) s;
    return new;
  end if;
  ids := doc_holders(new.id); if cardinality(ids) = 0 then return new; end if;
  lb := case new.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm' when 'lap' then 'Lập'
    when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'duyet_them' then 'Duyệt thêm' else new.status end;
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text) values (b.order_id, new.id, 'turn', app_uid(), _with_deleg(ids),
    case when (new.signs->-1)->>'action' = 'tra_ve' then 'Bị trả về – ' || lb || ': ' || coalesce((new.signs->-1)->>'note', '') else 'Đến lượt bạn: ' || lb end);
  return new;
end $$;
do $$ begin
  create trigger docs_turn_msg after update on public.docs for each row execute function public.docs_turn_msg();
exception when duplicate_object then null; end $$;
