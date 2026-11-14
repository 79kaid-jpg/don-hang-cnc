-- Đợt 1 (yêu cầu 14/11): QT2 Lệnh kế toán; QT0 Ngày cần hoàn thành bóc tách; checklist QT0 kiểm tra/duyệt
insert into proc_fields(proc, area, tbl, key, label, type, ord, active, perms)
select 'QT2','header','','lenh_ke_toan','Lệnh kế toán','text',0,true,'{}'::jsonb
where not exists (select 1 from proc_fields where proc='QT2' and area='header' and key='lenh_ke_toan');
insert into proc_fields(proc, area, tbl, key, label, type, ord, active, perms)
select 'QT0','header','','han_boc_tach','Ngày cần hoàn thành bóc tách','date',1,true,'{"PN":{"tiep_nhan":"required"}}'::jsonb
where not exists (select 1 from proc_fields where proc='QT0' and area='header' and key='han_boc_tach');
insert into step_checks(proc, step, label, level, ord, active)
select 'QT0', s, l, 'req', o, true from (values
  ('kiem_tra','Kiểm tra hao hụt',4),('kiem_tra','Kiểm tra định mức sản xuất',5),('kiem_tra','Kiểm tra công cụ dụng cụ sản xuất',6),
  ('duyet','Đối chiếu yêu cầu của khách hàng',3)) v(s,l,o)
where not exists (select 1 from step_checks x where x.proc='QT0' and x.step=v.s and x.label=v.l);
-- Mẫu in mới (Lệnh kế toán ở góc phải; BBGN: A giao · B vận chuyển · C nhận, Bên A ký Người lập + Thủ kho) đã tải lên storage
