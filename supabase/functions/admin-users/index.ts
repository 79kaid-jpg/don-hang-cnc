// Tạo tài khoản người dùng mới (chỉ Admin IT). Dùng service role ở máy chủ; khoá không bao giờ ra trình duyệt.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ROLES = ['admin_it', 'giam_doc', 'thiet_ke_qt', 'kinh_doanh', 'ky_thuat', 'kiem_tra_f1', 'admin_cnc', 'ke_hoach', 'mua_hang', 'kho_qc', 'ipc', 'duyet', 'xem'];
const UNITS = ['CNC', 'IPC', 'HANWA', 'IT', 'KHAC'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401);
  const { data: me } = await admin.from('profiles').select('roles, active').eq('id', u.user.id).single();
  if (!me?.active || !(me.roles ?? []).includes('admin_it')) return json({ error: 'Chỉ Admin IT được quản lý tài khoản' }, 403);

  const b = await req.json().catch(() => ({}));
  // Quản lý tài khoản có sẵn: xem email / đổi email, mật khẩu / xoá
  if (b.op === 'get' || b.op === 'update' || b.op === 'delete') {
    const id = String(b.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Thiếu người dùng' }, 400);
    if (b.op === 'get') { const { data } = await admin.auth.admin.getUserById(id); return json({ email: data?.user?.email ?? '' }); }
    if (b.op === 'update') {
      const patch: Record<string, unknown> = {};
      if (b.email !== undefined) { const e = String(b.email).trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: 'Email không hợp lệ' }, 400); patch.email = e; patch.email_confirm = true; }
      if (b.password !== undefined) { const p = String(b.password); if (p.length < 8) return json({ error: 'Mật khẩu phải từ 8 ký tự' }, 400); patch.password = p; }
      const { error } = await admin.auth.admin.updateUserById(id, patch);
      if (error) return json({ error: /already/i.test(error.message) ? 'Email này đã có tài khoản khác' : error.message }, 400);
      return json({ ok: true });
    }
    if (id === u.user.id) return json({ error: 'Không tự xoá tài khoản của mình' }, 400);
    // Đã ký duyệt phiếu nào (lưu trong jsonb, không có khoá ngoại) → không xoá để giữ lịch sử
    const { data: signed } = await admin.from('docs').select('id').contains('signs', [{ user: id }]).limit(1);
    if (signed?.length) return json({ error: 'Người này đã ký duyệt hồ sơ – không xoá được để giữ lịch sử. Hãy tắt "Cho phép đăng nhập" để khoá.' }, 400);
    // Xoá hồ sơ trước: nếu đã có dữ liệu tham chiếu (đơn, phiếu…) cơ sở dữ liệu sẽ chặn → báo khoá thay vì xoá
    for (const g of (await admin.from('work_groups').select('id, member_ids').contains('member_ids', [id])).data ?? [])
      await admin.from('work_groups').update({ member_ids: g.member_ids.filter((m: string) => m !== id) }).eq('id', g.id);
    await admin.from('zalo_link_codes').delete().eq('user_id', id);
    const { error: pe } = await admin.from('profiles').delete().eq('id', id);
    if (pe) return json({ error: 'Người này đã có dữ liệu trong hệ thống (' + (pe.details ?? pe.message).slice(0, 120) + '). Không xoá được – hãy tắt "Cho phép đăng nhập" để khoá.' }, 400);
    const { error: de } = await admin.auth.admin.deleteUser(id);
    if (de) return json({ error: 'Đã xoá hồ sơ nhưng chưa xoá được đăng nhập: ' + de.message }, 500);
    return json({ ok: true });
  }
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
