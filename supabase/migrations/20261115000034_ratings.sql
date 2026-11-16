-- Đánh giá chất lượng khi duyệt: riêng tư (người được đánh giá, người đánh giá, Admin IT)
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.docs(id) on delete cascade,
  rater uuid not null references public.profiles(id),
  ratee uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  comment text not null default '',
  acting boolean not null default false,
  ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_id, rater, ratee)
);
alter table public.ratings enable row level security;
drop policy if exists ratings_read on public.ratings;
create policy ratings_read on public.ratings for select to authenticated
  using (ratee = public.app_uid() or rater = public.app_uid() or public.has_role('admin_it'));

-- Người đã ký Duyệt / cấp duyệt thêm phiếu này mới được đánh giá những người ký trước đó
create or replace function public.rating_targets(p_doc uuid)
returns table(user_id uuid, role text, mine smallint, tags text[], comment text, editable boolean)
language sql stable security definer set search_path = public as $$
  with d as (select signs from docs where id = p_doc),
  me as (select max((s->>'at')::timestamptz) at from d, jsonb_array_elements(d.signs) s
         where s->>'action' = 'ky' and s->>'role' = 'duyet' and (s->>'user')::uuid = app_uid()),
  t as (select (s->>'user')::uuid u, (array_agg(s->>'role' order by s->>'at' desc))[1] r
        from d, me, jsonb_array_elements(d.signs) s
        where me.at is not null and s->>'action' = 'ky' and (s->>'user')::uuid <> app_uid() and (s->>'at')::timestamptz < me.at
        group by 1)
  select t.u, t.r, x.stars, x.tags, x.comment, (x.id is null or x.created_at > now() - interval '24 hours')
  from t left join ratings x on x.doc_id = p_doc and x.rater = app_uid() and x.ratee = t.u;
$$;

create or replace function public.rating_save(p_doc uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; n int := 0; tg record; who text; code text; old ratings;
begin
  select coalesce(nullif(d.header->>'so_xn', ''), o.code, '') into code from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
  select full_name into who from profiles where id = app_uid();
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'stars')::int, 0) = 0 then continue; end if;
    select * into tg from rating_targets(p_doc) where user_id = (it->>'ratee')::uuid;
    if not found then raise exception 'Bạn không đánh giá được người này cho phiếu này'; end if;
    if not tg.editable then raise exception 'Đã quá 24 giờ, không sửa được đánh giá'; end if;
    select * into old from ratings where doc_id = p_doc and rater = app_uid() and ratee = (it->>'ratee')::uuid;
    insert into ratings(doc_id, rater, ratee, stars, tags, comment, acting)
      values (p_doc, app_uid(), (it->>'ratee')::uuid, (it->>'stars')::int,
              coalesce(array(select jsonb_array_elements_text(it->'tags')), '{}'), left(coalesce(it->>'comment', ''), 1000), auth.uid() <> app_uid())
      on conflict (doc_id, rater, ratee) do update set stars = excluded.stars, tags = excluded.tags, comment = excluded.comment, acting = excluded.acting, updated_at = now(), ack_at = null;
    if old.id is null then  -- chỉ báo riêng lần đầu, không gửi nhóm
      perform _zsend(array[(it->>'ratee')::uuid], 'Bạn nhận đánh giá ' || repeat('★', (it->>'stars')::int) || ' từ ' || coalesce(who, '') || ' · ' || code
        || case when coalesce(it->>'comment', '') <> '' then E'\n“' || left(it->>'comment', 300) || '”' else '' end || E'\nXem: app PMS → Phản hồi cho tôi');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.rating_ack(p_id uuid) returns void language sql security definer set search_path = public as $$
  update ratings set ack_at = now() where id = p_id and ratee = app_uid();
$$;

-- Điểm trung bình cho Hiệu quả & thưởng (chỉ số tổng hợp, không lộ từng đánh giá; bỏ lượt Admin làm thay)
create or replace function public.rating_stats(p_from timestamptz, p_to timestamptz)
returns table(user_id uuid, avg_stars numeric, n int) language sql stable security definer set search_path = public as $$
  select ratee, round(avg(stars)::numeric, 2), count(*)::int from ratings
  where not acting and created_at >= p_from and created_at < p_to group by ratee;
$$;

revoke all on function public.rating_targets(uuid), public.rating_save(uuid, jsonb), public.rating_ack(uuid), public.rating_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.rating_targets(uuid), public.rating_save(uuid, jsonb), public.rating_ack(uuid), public.rating_stats(timestamptz, timestamptz) to authenticated;
grant select on public.ratings to authenticated;

-- Tổng hợp theo ngày cho bảng xếp hạng (không lộ từng đánh giá)
create or replace function public.rating_list_stats()
returns table(ratee uuid, day date, sum int, n int) language sql stable security definer set search_path = public as $$
  select ratee, (created_at at time zone 'Asia/Ho_Chi_Minh')::date, sum(stars)::int, count(*)::int from ratings
  where not acting and created_at > now() - interval '400 days' group by 1, 2;
$$;
revoke all on function public.rating_list_stats() from public, anon;
grant execute on function public.rating_list_stats() to authenticated;
drop function if exists public.rating_stats(timestamptz, timestamptz);
-- Trọng số mặc định: thêm "Đánh giá sao" 20%, các tiêu chí cũ co lại theo tỉ lệ
update perf_config set cfg = cfg || jsonb_build_object('w_ontime', 32, 'w_speed', 20, 'w_quality', 16, 'w_volume', 12, 'w_rating', 20, 'rating_min', 5)
  where id = 1 and not (cfg ? 'w_rating');
