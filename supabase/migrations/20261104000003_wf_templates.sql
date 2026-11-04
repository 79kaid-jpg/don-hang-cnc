-- Mẫu quy trình (chỉ đọc, nhân bản để sửa): QT0 bóc tách, QT1 xác nhận đơn hàng 3 công ty, đề nghị mua hàng
do $$
declare p uuid;
  u_dung text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'dung@pncnc.local');
  u_hau text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'hau@pncnc.local');
  u_ma text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'maianh.pn@pncnc.local');
  u_na text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'ngocanh@pncnc.local');
  u_ikt text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'ipc.kt@pncnc.local');
  u_idy text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'ipc.duyet@pncnc.local');
  u_hwa text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'hw.admin@pncnc.local');
  u_hkt text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'hw.kt@pncnc.local');
  u_hdy text := (select p.id::text from profiles p join auth.users u on u.id = p.id where u.email = 'hw.duyet@pncnc.local');
begin
  if exists (select 1 from wf_processes where code = 'MAU-QT0') then return; end if;

  insert into wf_processes(code, name, description, category, is_template) values ('MAU-QT0', 'QT0 · Bóc tách bản vẽ',
    'Chỉ Phương Nam CNC. Đầu ra: danh sách tấm đã ký. Duyệt có thể Fail.', 'Sản xuất', true) returning id into p;
  insert into wf_versions(process_id, version, status, published_at, def) values (p, 1, 'phat_hanh', now(), jsonb_build_object(
    'lanes', jsonb_build_array(jsonb_build_object('id','pn','name','Phương Nam CNC')),
    'steps', jsonb_build_array(
      jsonb_build_object('id','s1','name','Admin tiếp nhận bản vẽ','kind','lap','lane','pn','assignee',jsonb_build_object('type','role','id','admin_cnc'),'sla_hours',4,'checklist',jsonb_build_array('Đã tải bản vẽ lên','Đã ghi chú yêu cầu của khách')),
      jsonb_build_object('id','s2','name','Bóc tách kỹ thuật','kind','lap','lane','pn','assignee',jsonb_build_object('type','user','id',u_hau),'sla_hours',24,'allow_back',true,'checklist',jsonb_build_array('Đã đính kèm file Excel bóc tách chi tiết')),
      jsonb_build_object('id','s3','name','Tạo danh sách tấm trên form','kind','lap','lane','pn','assignee',jsonb_build_object('type','role','id','admin_cnc'),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','s4','name','Kiểm tra bản vẽ + ghi chú','kind','kiem_tra','lane','pn','assignee',jsonb_build_object('type','user','id',u_ma),'sla_hours',8,'allow_back',true),
      jsonb_build_object('id','s5','name','Duyệt – sẵn sàng chạy?','kind','duyet','lane','pn','assignee',jsonb_build_object('type','user','id',u_dung),'sla_hours',8,'allow_back',true,'allow_fail',true)
    )));

  insert into wf_processes(code, name, description, category, is_template) values ('MAU-QT1', 'QT1 · Xác nhận đơn hàng (PN → IPC → Hanwha)',
    'Ba công ty lập – kiểm tra – duyệt nối tiếp. Khách ký tay trên bản in.', 'Bán hàng', true) returning id into p;
  insert into wf_versions(process_id, version, status, published_at, def) values (p, 1, 'phat_hanh', now(), jsonb_build_object(
    'lanes', jsonb_build_array(jsonb_build_object('id','pn','name','Phương Nam CNC'), jsonb_build_object('id','ipc','name','IPC'), jsonb_build_object('id','hw','name','Hanwha')),
    'steps', jsonb_build_array(
      jsonb_build_object('id','p1','name','PN lập đơn + đơn giá','kind','lap','lane','pn','assignee',jsonb_build_object('type','role','id','admin_cnc'),'sla_hours',8,'checklist',jsonb_build_array('Đủ đơn giá mọi dòng')),
      jsonb_build_object('id','p2','name','PN kiểm tra','kind','kiem_tra','lane','pn','assignee',jsonb_build_object('type','user','id',u_dung),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','p3','name','PN duyệt','kind','duyet','lane','pn','assignee',jsonb_build_object('type','user','id',u_dung),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','i1','name','IPC lập đơn + giá IPC','kind','lap','lane','ipc','assignee',jsonb_build_object('type','user','id',u_na),'sla_hours',8,'allow_back',true),
      jsonb_build_object('id','i2','name','IPC kiểm tra','kind','kiem_tra','lane','ipc','assignee',jsonb_build_object('type','user','id',u_ikt),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','i3','name','IPC duyệt','kind','duyet','lane','ipc','assignee',jsonb_build_object('type','user','id',u_idy),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','h1','name','Hanwha lập đơn + giá Hanwha','kind','lap','lane','hw','assignee',jsonb_build_object('type','user','id',u_hwa),'sla_hours',8,'allow_back',true),
      jsonb_build_object('id','h2','name','Hanwha kiểm tra','kind','kiem_tra','lane','hw','assignee',jsonb_build_object('type','user','id',u_hkt),'sla_hours',4,'allow_back',true),
      jsonb_build_object('id','h3','name','Hanwha duyệt','kind','duyet','lane','hw','assignee',jsonb_build_object('type','user','id',u_hdy),'sla_hours',4,'allow_back',true)
    )));

  insert into wf_processes(code, name, description, category, is_template) values ('MAU-MUA', 'Đề nghị mua vật tư',
    'Mẫu chung: lập → trưởng bộ phận duyệt → mua hàng xử lý.', 'Hành chính', true) returning id into p;
  insert into wf_versions(process_id, version, status, published_at, def) values (p, 1, 'phat_hanh', now(), jsonb_build_object(
    'lanes', jsonb_build_array(jsonb_build_object('id','bp','name','Bộ phận đề nghị'), jsonb_build_object('id','mh','name','Mua hàng')),
    'steps', jsonb_build_array(
      jsonb_build_object('id','m1','name','Lập đề nghị','kind','lap','lane','bp','assignee',jsonb_build_object('type','role','id','admin_cnc'),'sla_hours',0),
      jsonb_build_object('id','m2','name','Trưởng bộ phận duyệt','kind','duyet','lane','bp','assignee',jsonb_build_object('type','role','id','duyet'),'sla_hours',8,'allow_back',true,'allow_fail',true),
      jsonb_build_object('id','m3','name','Mua hàng xử lý','kind','lap','lane','mh','assignee',jsonb_build_object('type','role','id','mua_hang'),'sla_hours',48,'allow_back',true,'require_note',true)
    )));
end $$;
