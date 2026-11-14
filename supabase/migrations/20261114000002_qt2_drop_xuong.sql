-- Tắt trường 'Xưởng gia công' (QT2) – không có trên lệnh giấy, không dùng ở đâu
update public.proc_fields set active=false, perms='{}'::jsonb, updated_at=now() where proc='QT2' and area='header' and key='xuong';
