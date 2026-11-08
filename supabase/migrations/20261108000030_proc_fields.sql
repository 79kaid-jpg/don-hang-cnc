-- Trường dữ liệu QT0–QT3 cấu hình được: đầu phiếu, cột bảng, tệp đính kèm; quyền theo bước × công ty
create table if not exists public.proc_fields (
  id uuid primary key default gen_random_uuid(),
  proc text not null check (proc in ('QT0','QT1','QT2','QT3')),
  area text not null check (area in ('header','col','file')),
  tbl text not null default '',
  key text not null,
  label text not null,
  type text not null default 'text' check (type in ('text','number','date','select','textarea','file')),
  options text[] not null default '{}',
  help text not null default '',
  decimals int,
  ord int not null default 0,
  active boolean not null default true,
  sys boolean not null default false,       -- cột tự tính / cột hệ thống: không xoá, không đổi khoá
  perms jsonb not null default '{}',        -- {"PN": {"lap": "required", "kiem_tra": "view"}, ...}; thiếu = mặc định
  updated_at timestamptz not null default now(),
  unique (proc, area, tbl, key)
);
alter table public.proc_fields enable row level security;
do $$ begin
  create policy proc_fields_read on public.proc_fields for select to authenticated using (true);
  create policy proc_fields_admin on public.proc_fields for all to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));
exception when duplicate_object then null; end $$;
grant select, insert, update on public.proc_fields to authenticated;

-- Kiểm tra trường bắt buộc ở bước hiện tại của công ty này
create or replace function public._req_check(p_doc uuid) returns void language plpgsql stable security definer set search_path = public as $$
declare d docs; b batches; st text; miss text[] := '{}'; f record;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  st := case when d.status = 'duyet_them' then 'duyet' else d.status end;
  for f in select * from proc_fields where proc = b.proc and active and perms->d.company->>st = 'required' order by area, ord loop
    if f.area = 'header' and coalesce(trim(d.header->>f.key), '') = '' then miss := miss || f.label;
    elsif f.area = 'file' and not exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) x where x->>'kind' = f.key) then miss := miss || ('Tệp: ' || f.label);
    elsif f.area = 'col' and f.sys = false and exists (select 1 from jsonb_array_elements(coalesce(d.tables->f.tbl, '[]')) x where coalesce(trim(x->>f.key), '') = '')
      then miss := miss || ('Cột ' || f.label);
    end if;
  end loop;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
end $$;
revoke execute on function public._req_check(uuid) from public, anon, authenticated;

-- Gắn vào doc_advance: kiểm tra trước khi ký
do $$ declare s text; begin
  s := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  if position('_req_check' in s) = 0 then
    execute replace(s, 'if p_action = ''next'' then', 'if p_action = ''next'' then' || chr(10) || '    perform _req_check(p_doc);');
  end if;
end $$;

insert into public.proc_fields(proc, area, tbl, key, label, type, decimals, ord, sys, perms) values
('QT0','header','','ngay_nhan','Ngày nhận bản vẽ','date',null,0,false,'{}'),
('QT0','header','','kenh','Kênh nhận (email / Zalo)','text',null,1,false,'{}'),
('QT0','header','','hao_hut','Hao hụt dự kiến (%)','number',null,2,false,'{}'),
('QT0','col','ds','ma_tam','Mã tấm','text',null,0,false,'{}'),
('QT0','col','ds','vat_lieu','Vật liệu','text',null,1,false,'{}'),
('QT0','col','ds','day','Dày (mm)','number',1,2,false,'{}'),
('QT0','col','ds','dai','Dài (mm)','number',null,3,false,'{}'),
('QT0','col','ds','rong','Rộng (mm)','number',null,4,false,'{}'),
('QT0','col','ds','so_tam','Số tấm','number',null,5,false,'{}'),
('QT0','col','ds','m2_tam','m² trải phẳng / tấm','number',2,6,false,'{}'),
('QT0','col','ds','m2','Tổng m²','number',2,7,true,'{}'),
('QT0','col','ds','kg','Khối lượng (kg)','number',1,8,true,'{}'),
('QT0','col','ds','duong_han','Đường hàn (m)','number',1,9,false,'{}'),
('QT0','col','ds','chan','Số lần chấn','number',null,10,false,'{}'),
('QT0','col','ds','m2_dot','m² đột','number',2,11,false,'{}'),
('QT0','col','ds','ghi_chu','Ghi chú','text',null,12,false,'{}'),
('QT0','file','','ban_ve','Bản vẽ / tài liệu khách gửi','file',null,0,false,'{}'),
('QT0','file','','excel','Excel bóc tách chi tiết','file',null,1,false,'{"PN":{"boc_tach":"required"}}'),
('QT1','header','','so_xn','Số XNĐH','text',null,0,false,'{}'),
('QT1','header','','ngay','Ngày lập','date',null,1,false,'{}'),
('QT1','header','','dk_giao','Điều kiện giao hàng','text',null,2,false,'{}'),
('QT1','header','','dk_tt','Điều kiện thanh toán','text',null,3,false,'{}'),
('QT1','header','','vat','Thuế GTGT (%)','number',null,4,false,'{}'),
('QT1','col','ds','ma_tam','Mã tấm','text',null,0,false,'{}'),
('QT1','col','ds','vat_lieu','Vật liệu','text',null,1,false,'{}'),
('QT1','col','ds','day','Dày (mm)','number',1,2,false,'{}'),
('QT1','col','ds','so_tam','Số tấm','number',null,3,false,'{}'),
('QT1','col','ds','m2_tam','m² / tấm','number',2,4,false,'{}'),
('QT1','col','ds','m2','Tổng m²','number',2,5,true,'{}'),
('QT1','col','ds','kg','Khối lượng (kg)','number',1,6,true,'{}'),
('QT1','col','ds','don_gia','Đơn giá (đ/m²)','number',null,7,false,'{"PN":{"lap":"required"},"IPC":{"lap":"required"},"HW":{"lap":"required"}}'),
('QT1','col','ds','tt','Thành tiền (đ)','number',null,8,true,'{}'),
('QT1','col','ds','ghi_chu','Ghi chú','text',null,9,false,'{}'),
('QT1','file','','dinh_kem','File đính kèm (Excel từ phần mềm SX…)','file',null,0,false,'{}'),
('QT2','header','','so_lenh','Số lệnh gia công','text',null,0,false,'{"PN":{"lap":"required"},"IPC":{"lap":"required"},"HW":{"lap":"required"}}'),
('QT2','header','','so_hd','Số hợp đồng','text',null,1,false,'{}'),
('QT2','header','','xuong','Xưởng gia công','text',null,2,false,'{}'),
('QT2','header','','kho_xuat','Kho xuất','text',null,3,false,'{}'),
('QT2','header','','kho_nhan','Kho nhận','text',null,4,false,'{}'),
('QT2','header','','dang_gc','Dạng gia công','text',null,5,false,'{}'),
('QT2','col','nl','tam_phoi','Tấm phôi / quy cách','text',null,0,false,'{}'),
('QT2','col','nl','vat_lieu','Vật liệu','text',null,1,false,'{}'),
('QT2','col','nl','day','Dày (mm)','number',1,2,false,'{}'),
('QT2','col','nl','so_tam','Số tấm','number',null,3,false,'{}'),
('QT2','col','nl','m2','Tổng m²','number',2,4,false,'{}'),
('QT2','col','nl','kg','Khối lượng (kg)','number',1,5,true,'{}'),
('QT2','col','nl','ghi_chu','Ghi chú','text',null,6,false,'{}'),
('QT2','col','tp','ma_tam','Mã tấm thành phẩm','text',null,0,false,'{}'),
('QT2','col','tp','vat_lieu','Vật liệu','text',null,1,false,'{}'),
('QT2','col','tp','day','Dày (mm)','number',1,2,false,'{}'),
('QT2','col','tp','so_tam','Số tấm','number',null,3,false,'{}'),
('QT2','col','tp','m2','Tổng m²','number',2,4,false,'{}'),
('QT2','col','tp','kg','Khối lượng (kg)','number',1,5,true,'{}'),
('QT2','col','tp','ghi_chu','Ghi chú','text',null,6,false,'{}'),
('QT2','file','','dinh_kem','File đính kèm (Excel từ phần mềm SX…)','file',null,0,false,'{}'),
('QT3','header','','so_phieu','Số phiếu','text',null,0,false,'{}'),
('QT3','header','','ngay_giao','Ngày giao','date',null,1,false,'{}'),
('QT3','header','','dia_diem','Địa điểm giao','text',null,2,false,'{}'),
('QT3','header','','xe','Xe / biển số','text',null,3,false,'{}'),
('QT3','header','','tai_xe','Tài xế','text',null,4,false,'{}'),
('QT3','col','tp','pallet','Mã pallet','text',null,0,false,'{}'),
('QT3','col','tp','ma_tam','Mã tấm','text',null,1,false,'{}'),
('QT3','col','tp','vat_lieu','Vật liệu','text',null,2,false,'{}'),
('QT3','col','tp','day','Dày (mm)','number',1,3,false,'{}'),
('QT3','col','tp','so_tam','Số tấm','number',null,4,false,'{}'),
('QT3','col','tp','m2','Tổng m²','number',2,5,false,'{}'),
('QT3','col','tp','kg','Khối lượng (kg)','number',1,6,true,'{}'),
('QT3','col','tp','ghi_chu','Ghi chú','text',null,7,false,'{}'),
('QT3','file','','dinh_kem','File đính kèm (Excel từ phần mềm SX…)','file',null,0,false,'{}')
on conflict (proc, area, tbl, key) do nothing;
