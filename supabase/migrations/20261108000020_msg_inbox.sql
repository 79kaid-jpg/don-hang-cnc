-- Chuông thông báo trong app cho tin Trao đổi
alter table public.profiles add column if not exists msgs_seen_at timestamptz;
create or replace function public.my_msgs(p_limit int default 30)
 returns table(id uuid, order_id uuid, code text, project text, proc text, company text, kind text, from_name text, text text, via text, at timestamptz, unread boolean)
 language sql stable security definer set search_path = public as $$
  select m.id, m.order_id, o.code, o.project, b.proc, d.company, m.kind, coalesce(p.full_name, 'Hệ thống'), m.text, m.via, m.at,
    m.at > coalesce((select msgs_seen_at from profiles where id = app_uid()), '-infinity')
  from order_msgs m join orders o on o.id = m.order_id left join docs d on d.id = m.doc_id left join batches b on b.id = d.batch_id
  left join profiles p on p.id = m.from_user
  where m.to_users && my_ids() and m.from_user is distinct from app_uid()
  order by m.at desc limit least(coalesce(p_limit, 30), 100);
$$;
create or replace function public.seen_msgs() returns void language sql security definer set search_path = public as $$
  update profiles set msgs_seen_at = now() where id = app_uid();
$$;
revoke execute on function public.my_msgs(int), public.seen_msgs() from public, anon;
grant execute on function public.my_msgs(int), public.seen_msgs() to authenticated;
