-- Checklist theo bước. Mục bắt buộc phải tick xong mới được chuyển bước tiến (nút hay kéo thả đều qua trigger này).
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  step text not null,              -- qt0.tiep_nhan, qt2.b1, qt3.thong_bao …
  label text not null,
  required boolean not null default true,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.checklist_done (
  order_id uuid not null references public.orders(id),
  item_id uuid not null references public.checklist_items(id),
  done boolean not null default true,
  done_by uuid references public.profiles(id) default auth.uid(),
  done_at timestamptz not null default now(),
  primary key (order_id, item_id)
);
alter table public.checklist_items enable row level security;
alter table public.checklist_done enable row level security;
create policy ci_read on public.checklist_items for select to authenticated using (true);
create policy ci_ins on public.checklist_items for insert to authenticated with check (has_role('admin_it'));
create policy ci_upd on public.checklist_items for update to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));
create policy cd_read on public.checklist_done for select to authenticated using (true);
create policy cd_ins on public.checklist_done for insert to authenticated with check (auth.uid() is not null);
create policy cd_upd on public.checklist_done for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
grant select, insert, update on public.checklist_items, public.checklist_done to authenticated;

-- Bước hiện tại của đơn theo từng quy trình, kèm thứ hạng trong quy trình
create or replace function public._steps(s text, n text, g text, h text) returns text[] language sql immutable as $$
  select array_remove(array[
    case when s in ('tiep_nhan','boc_tach','kiem_tra_f1') then 'qt0.' || s end,
    case when s in ('xndh','cho_duyet_xndh','cho_khach') then 'qt1.' || s end,
    case when s = 'san_xuat' then case g when 'lap_lgc' then 'qt2.b1' when 'cho_duyet_lgc' then 'qt2.b2'
      when 'cho_nvl' then case when n = 'nhap_kho' then 'qt2.b4' else 'qt2.b3' end
      when 'ban_giao' then 'qt2.b5' when 'gia_cong' then 'qt2.b6' end end,
    case when h in ('thong_bao','lap_lgh','cho_duyet_lgh','giao_hang','ky_bbgh') then 'qt3.' || h end], null) $$;

create or replace function public._step_rank(k text) returns int language sql immutable as $$
  select array_position(array['qt0.tiep_nhan','qt0.boc_tach','qt0.kiem_tra_f1','qt1.xndh','qt1.cho_duyet_xndh','qt1.cho_khach',
    'qt2.b1','qt2.b2','qt2.b3','qt2.b4','qt2.b5','qt2.b6','qt3.thong_bao','qt3.lap_lgh','qt3.cho_duyet_lgh','qt3.giao_hang','qt3.ky_bbgh'], k) $$;

create or replace function public.checklist_missing(p_order uuid, p_step text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(i.label order by i.sort), '{}') from checklist_items i
  where i.step = p_step and i.active and i.required
    and not exists (select 1 from checklist_done d where d.order_id = p_order and d.item_id = i.id and d.done) $$;
grant execute on function public.checklist_missing(uuid, text) to authenticated;

create or replace function public.guard_checklist() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; nk text; miss text[]; olds text[]; news text[];
begin
  if new.status = 'huy' then return new; end if;
  olds := _steps(old.status, old.nvl_status, old.gc_status, old.gh_status);
  news := _steps(new.status, new.nvl_status, new.gc_status, new.gh_status);
  foreach k in array olds loop
    continue when k = any(news);
    nk := null;
    -- bước kế trong cùng quy trình (nếu còn); lùi bước (không đạt / từ chối) thì không đòi checklist
    select x into nk from unnest(news) x where split_part(x, '.', 1) = split_part(k, '.', 1) limit 1;
    if nk is not null and _step_rank(nk) < _step_rank(k) then continue; end if;
    miss := checklist_missing(new.id, k);
    if array_length(miss, 1) > 0 then
      raise exception 'Chưa xong checklist bắt buộc: %', array_to_string(miss, '; ');
    end if;
  end loop;
  return new;
end $$;
create trigger orders_checklist before update on public.orders for each row execute function public.guard_checklist();

-- Nạp sẵn theo checklist BASE
insert into public.checklist_items(step, label, required, sort)
select v.step, v.label, v.req, v.ord from (values
  ('qt0.tiep_nhan','Nhận đủ bản vẽ / yêu cầu của khách',true,1),
  ('qt0.tiep_nhan','Ghi đủ KH1, KH2, dự án, ngày cần giao',true,2),
  ('qt0.tiep_nhan','Chọn người bóc tách',true,3),
  ('qt0.boc_tach','Bóc tách đủ mã TP, vật liệu, kích thước',true,1),
  ('qt0.boc_tach','Đối chiếu số tấm với bản vẽ',true,2),
  ('qt0.kiem_tra_f1','Kiểm tra quy cách và khối lượng F1',true,1),
  ('qt1.xndh','Nhập đơn giá từng dòng',true,1),
  ('qt1.xndh','Ghi VAT, điều kiện giao / thanh toán',true,2),
  ('qt1.cho_duyet_xndh','Người duyệt xem đơn giá và điều kiện',false,1),
  ('qt1.cho_khach','Gửi XNĐH cho KH1 (IPC)',true,1),
  ('qt1.cho_khach','Gửi XNĐH cho KH2 (Hanwa)',true,2),
  ('qt1.cho_khach','Tải PDF XNĐH đã ký',true,3),
  ('qt2.b1','Kiểm tra XNĐH đã ký và F1',true,1),
  ('qt2.b1','Điền F5, dự phòng %',true,2),
  ('qt2.b1','Kiểm tra tồn kho từng loại NVL, điền F3',true,3),
  ('qt2.b1','Nhập kho xuất / nhận, ngày bắt đầu / hoàn thành',true,4),
  ('qt2.b1','In F5 + F3 trình duyệt',false,5),
  ('qt2.b2','Duyệt 4 cấp: Anh Mai → Dung (kèm NVL) → Thủy → Anh Kiên',false,1),
  ('qt2.b3','Lấy báo giá nhà cung cấp',true,1),
  ('qt2.b3','Lập PO theo cột Cần mua',true,2),
  ('qt2.b3','Gửi PO, ghi số PO và ngày NVL về',true,3),
  ('qt2.b4','Nhận NVL, cân / đếm số thực nhận',true,1),
  ('qt2.b4','QC thực tế, ghi số lỗi',true,2),
  ('qt2.b4','Tải biên bản QC',true,3),
  ('qt2.b5','Xác nhận ĐK3 (LGC đã duyệt + NVL đạt)',true,1),
  ('qt2.b5','Xuất NVL theo LGC, ghi bảng F6',true,2),
  ('qt2.b5','Ghi bên giao, bên nhận, tải biên bản ký',true,3),
  ('qt2.b6','Theo dõi tiến độ gia công',false,1),
  ('qt2.b6','QC thành phẩm',true,2),
  ('qt2.b6','Nhập số pallet thành phẩm',true,3),
  ('qt3.thong_bao','Lập packing list theo pallet',true,1),
  ('qt3.thong_bao','Báo ngày giao và địa điểm cho khách',true,2),
  ('qt3.lap_lgh','Ghi mã lệnh PMKT, xe, tài xế',true,1),
  ('qt3.giao_hang','Kiểm đếm pallet khi giao',true,1),
  ('qt3.giao_hang','Chụp ảnh giao hàng',true,2),
  ('qt3.ky_bbgh','Thu bộ LGH / BBGH đã ký',true,1),
  ('qt3.ky_bbgh','Đóng hết phiếu F7',true,2)
) as v(step, label, req, ord)
where not exists (select 1 from public.checklist_items);
