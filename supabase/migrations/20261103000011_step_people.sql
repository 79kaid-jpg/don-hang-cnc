-- Người thực hiện + người giám sát + thời hạn cho từng bước (giống giai đoạn BASE Workflow)
create table if not exists public.step_defaults (
  step text primary key,
  role text not null default '',            -- vai trò được làm bước (để gợi ý người thực hiện)
  approval boolean not null default false,  -- bước duyệt: người thực hiện = người duyệt
  doer_id uuid references public.profiles(id),
  supervisor_ids uuid[] not null default '{}',
  sla_hours numeric not null default 24
);
create table if not exists public.order_steps (
  order_id uuid not null references public.orders(id),
  step text not null,
  doer_id uuid references public.profiles(id),
  supervisor_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  due_at timestamptz,
  done_at timestamptz,
  done_by uuid references public.profiles(id),
  primary key (order_id, step)
);
alter table public.step_defaults enable row level security;
alter table public.order_steps enable row level security;
create policy sd_read on public.step_defaults for select to authenticated using (true);
create policy sd_upd on public.step_defaults for update to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));
create policy os_read on public.order_steps for select to authenticated using (true);
create policy os_upd on public.order_steps for update to authenticated
  using (has_role('admin_it') or has_role('admin_cnc') or has_role('kinh_doanh') or auth.uid() = any(supervisor_ids) or auth.uid() = doer_id)
  with check (true);
grant select, update on public.step_defaults, public.order_steps to authenticated;

-- chỉ được đổi người / hạn, không sửa mốc thời gian
create or replace function public.guard_order_steps() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.in_fn', true), '') <> 'on' then
    new.started_at := old.started_at; new.done_at := old.done_at; new.done_by := old.done_by;
  end if;
  return new;
end $$;
create trigger order_steps_guard before update on public.order_steps for each row execute function public.guard_order_steps();

-- Ghi mốc vào / ra bước, tự giao người theo mặc định
create or replace function public.track_steps() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; olds text[] := '{}'; news text[]; d step_defaults;
begin
  news := _steps(new.status, new.nvl_status, new.gc_status, new.gh_status);
  if tg_op = 'UPDATE' then olds := _steps(old.status, old.nvl_status, old.gc_status, old.gh_status); end if;
  perform set_config('app.in_fn', 'on', true);
  foreach k in array olds loop
    if not (k = any(news)) then
      update order_steps set done_at = now(), done_by = auth.uid() where order_id = new.id and step = k;
    end if;
  end loop;
  foreach k in array news loop
    if not (k = any(olds)) then
      d := null;
      select * into d from step_defaults where step = k;
      insert into order_steps(order_id, step, doer_id, supervisor_ids, started_at, due_at)
        values (new.id, k, d.doer_id, coalesce(d.supervisor_ids, '{}'), now(), now() + make_interval(mins => (coalesce(d.sla_hours, 24) * 60)::int))
      on conflict (order_id, step) do update set started_at = now(), done_at = null, done_by = null,
        due_at = excluded.due_at, doer_id = coalesce(order_steps.doer_id, excluded.doer_id);
    end if;
  end loop;
  return new;
end $$;
create trigger orders_track_ins after insert on public.orders for each row execute function public.track_steps();
create trigger orders_track_upd after update on public.orders for each row execute function public.track_steps();

-- Chuyển bước tiến: phải có người thực hiện (trừ bước duyệt) + checklist bắt buộc
create or replace function public.guard_checklist() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; nk text; miss text[]; olds text[]; news text[];
begin
  if new.status = 'huy' then return new; end if;
  olds := _steps(old.status, old.nvl_status, old.gc_status, old.gh_status);
  news := _steps(new.status, new.nvl_status, new.gc_status, new.gh_status);
  foreach k in array olds loop
    continue when k = any(news);
    nk := null;
    select x into nk from unnest(news) x where split_part(x, '.', 1) = split_part(k, '.', 1) limit 1;
    if nk is not null and _step_rank(nk) < _step_rank(k) then continue; end if;
    if not coalesce((select approval from step_defaults where step = k), false)
       and not exists (select 1 from order_steps where order_id = new.id and step = k and doer_id is not null) then
      raise exception 'Bước này chưa có người thực hiện: giao người trước khi chuyển';
    end if;
    miss := checklist_missing(new.id, k);
    if array_length(miss, 1) > 0 then
      raise exception 'Chưa xong checklist bắt buộc: %', array_to_string(miss, '; ');
    end if;
  end loop;
  return new;
end $$;

-- Mặc định: người thực hiện = người đầu tiên có vai trò; giám sát = Admin IT đầu tiên (Admin IT sửa lại trong Quản trị)
insert into public.step_defaults(step, role, approval, sla_hours)
select v.s, v.r, v.a, v.h from (values
  ('qt0.tiep_nhan','kinh_doanh',false,4),('qt0.boc_tach','ky_thuat',false,24),('qt0.kiem_tra_f1','kiem_tra_f1',false,4),
  ('qt1.xndh','admin_cnc',false,8),('qt1.cho_duyet_xndh','duyet',true,4),('qt1.cho_khach','admin_cnc',false,48),
  ('qt2.b1','admin_cnc',false,12),('qt2.b2','duyet',true,2),('qt2.b3','mua_hang',false,72),('qt2.b4','kho_qc',false,8),
  ('qt2.b5','admin_cnc',false,4),('qt2.b6','kho_qc',false,24),
  ('qt3.thong_bao','admin_cnc',false,8),('qt3.lap_lgh','admin_cnc',false,4),('qt3.cho_duyet_lgh','duyet',true,4),
  ('qt3.giao_hang','kho_qc',false,24),('qt3.ky_bbgh','kho_qc',false,24)) as v(s, r, a, h)
on conflict (step) do nothing;
update public.step_defaults d set
  doer_id = (select p.id from profiles p where p.active and d.role = any(p.roles) order by p.full_name limit 1),
  supervisor_ids = coalesce((select array[p.id] from profiles p where p.active and 'admin_it' = any(p.roles) order by p.full_name limit 1), '{}')
where d.doer_id is null;

-- Đơn đang chạy: tạo bước hiện tại
insert into public.order_steps(order_id, step, doer_id, supervisor_ids, started_at, due_at)
select o.id, k, d.doer_id, d.supervisor_ids, o.updated_at, o.updated_at + make_interval(mins => (d.sla_hours * 60)::int)
from orders o cross join lateral unnest(_steps(o.status, o.nvl_status, o.gc_status, o.gh_status)) k
join step_defaults d on d.step = k
on conflict (order_id, step) do nothing;
