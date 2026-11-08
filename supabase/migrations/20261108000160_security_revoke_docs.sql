-- Bảo mật: client chỉ đọc hồ sơ qua view docs_v (đã lọc theo công ty, che trường nhạy cảm)
revoke select on public.docs from anon, authenticated;
