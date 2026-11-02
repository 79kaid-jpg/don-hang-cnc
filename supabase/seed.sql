-- Danh mục và chuỗi duyệt mặc định. approver_id gán sau trên màn hình Quản trị.
insert into public.customers(code, name) values ('IPC','IPC'), ('HANWA','Hanwa') on conflict (code) do nothing;

insert into public.approval_steps(doc_type, step_no, label, hours) values
  ('F2',   1, 'Dung · duyệt XNĐH', 2),
  ('F3',   1, 'Dung · duyệt dự toán NVL', 8),
  ('PO',   1, 'Dung · duyệt PO', 8),
  ('F5',   1, 'CNC · Anh Mai kiểm tra', 2),
  ('F5',   2, 'CNC · Dung duyệt', 2),
  ('F5',   3, 'IPC · Thủy kiểm tra', 2),
  ('F5',   4, 'IPC · Anh Kiên duyệt', 2),
  ('LGH1', 1, 'Chặng 1 · Dung kiểm tra', 2),
  ('LGH1', 2, 'Chặng 1 · Chị Trang duyệt', 2),
  ('LGH2', 1, 'Chặng 2 · Nhung kiểm tra', 2),
  ('LGH2', 2, 'Chặng 2 · Anh Kiên duyệt', 2)
on conflict (doc_type, step_no) do nothing;
