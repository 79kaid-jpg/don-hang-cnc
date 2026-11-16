-- QT1–QT3: IPC và Hanwa áp dụng quy tắc ẩn/hiện/bắt buộc giống PN (chỉ điền khi công ty đó chưa có quy tắc riêng)
update proc_fields set perms = perms
  || case when perms ? 'IPC' then '{}'::jsonb else jsonb_build_object('IPC', perms->'PN') end
  || case when perms ? 'HW' then '{}'::jsonb else jsonb_build_object('HW', perms->'PN') end
where proc in ('QT1','QT2','QT3') and perms ? 'PN' and (not perms ? 'IPC' or not perms ? 'HW');
