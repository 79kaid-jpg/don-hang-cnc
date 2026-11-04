// Tạo tài khoản người dùng mới (chỉ Admin IT). Dùng service role ở máy chủ; khoá không bao giờ ra trình duyệt.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ROLES = ['admin_it', 'kinh_doanh', 'ky_thuat', 'kiem_tra_f1', 'admin_cnc', 'ke_hoach', 'mua_hang', 'kho_qc', 'ipc', 'duyet', 'xem'];
const UNITS = ['CNC', 'IPC', 'HANWHA', 'IT', 'KHAC'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401);
  const { data: me } = await admin.from('profiles').select('roles, active').eq('id', u.user.id).single();
  if (!me?.active || !(me.roles ?? []).includes('admin_it')) return json({ error: 'Chỉ Admin IT được tạo tài khoản' }, 403);

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  const full_name = String(b.full_name ?? '').trim();
  const password = String(b.password ?? '');
  const unit = UNITS.includes(b.unit) ? b.unit : 'CNC';
  const roles = (Array.isArray(b.roles) ? b.roles : []).filter((r: string) => ROLES.includes(r));
  const groups: string[] = Array.isArray(b.group_ids) ? b.group_ids : [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email không hợp lệ' }, 400);
  if (!full_name) return json({ error: 'Nhập họ tên' }, 400);
  if (password.length < 8) return json({ error: 'Mật khẩu tạm phải từ 8 ký tự' }, 400);

  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error || !created.user) return json({ error: /already/i.test(error?.message ?? '') ? 'Email này đã có tài khoản' : (error?.message ?? 'Không tạo được') }, 400);
  const id = created.user.id;
  const { error: pe } = await admin.from('profiles').upsert({ id, full_name, unit, roles, active: true });
  if (pe) return json({ error: 'Đã tạo tài khoản nhưng lưu hồ sơ lỗi: ' + pe.message, id }, 500);
  for (const g of groups) {
    const { data: wg } = await admin.from('work_groups').select('member_ids').eq('id', g).single();
    if (wg && !wg.member_ids.includes(id)) await admin.from('work_groups').update({ member_ids: [...wg.member_ids, id] }).eq('id', g);
  }
  return json({ ok: true, id });
});
