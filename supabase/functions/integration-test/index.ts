// Kiểm tra một khoá API (chỉ Admin IT). Khoá đọc ở máy chủ, không bao giờ trả về trình duyệt.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const SYSTEM = ['NOTIFY_KEY', 'WEBHOOK_KEY'];

async function test(provider: string, name: string, key: string): Promise<[boolean, string]> {
  const ctl = AbortSignal.timeout(15000);
  const form = (u: string) => fetch(u, { method: 'POST', signal: ctl, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token_v2: key }) }).then((r) => r.json());
  switch (provider) {
    case 'base': {
      const req = name.includes('REQUEST');
      const j = await form(req ? 'https://request.base.vn/extapi/v1/group/list' : 'https://workflow.base.vn/extapi/v1/workflows/get');
      return j?.code === 1 ? [true, req ? 'Kết nối Base Request OK' : `Kết nối Base Workflow OK · ${j.total_items ?? '?'} quy trình`] : [false, 'Base từ chối: ' + (j?.message || 'không rõ')];
    }
    case 'zalo': {
      const j = await fetch(`https://bot-api.zaloplatforms.com/bot${key}/getMe`, { signal: ctl }).then((r) => r.json());
      return j?.ok ? [true, 'Zalo Bot OK · ' + (j.result?.account_name ?? j.result?.display_name ?? '')] : [false, 'Zalo từ chối: ' + (j?.description ?? j?.error_code ?? 'không rõ')];
    }
    case 'anthropic': {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { signal: ctl, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      return r.ok ? [true, 'Anthropic API OK'] : [false, `Anthropic từ chối (${r.status}): ` + ((await r.json().catch(() => ({})))?.error?.message ?? '')];
    }
    case 'google': {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' + encodeURIComponent(key), { signal: ctl });
      return r.ok ? [true, 'Google API key OK (Gemini)'] : [false, `Google từ chối (${r.status}): ` + ((await r.json().catch(() => ({})))?.error?.message ?? '') + ' – khoá có thể chỉ bật cho API khác'];
    }
    case 'openai': {
      const r = await fetch('https://api.openai.com/v1/models', { signal: ctl, headers: { Authorization: 'Bearer ' + key } });
      return r.ok ? [true, 'OpenAI API OK'] : [false, `OpenAI từ chối (${r.status})`];
    }
    default: return [true, 'Đã lưu – loại khoá này chưa có kiểm tra tự động'];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401);
  const { data: me } = await admin.from('profiles').select('roles, active').eq('id', u.user.id).single();
  if (!me?.active || !(me.roles ?? []).includes('admin_it')) return json({ error: 'Chỉ Admin IT' }, 403);
  const { name } = await req.json().catch(() => ({}));
  if (!name || SYSTEM.includes(name)) return json({ error: 'Khoá không hợp lệ' }, 400);
  const { data: s } = await admin.from('app_secrets').select('value, provider').eq('name', name).single();
  if (!s?.value) return json({ error: 'Chưa có giá trị' }, 400);
  let ok = false, msg = '';
  try { [ok, msg] = await test(s.provider ?? '', name, s.value); } catch (e) { ok = false; msg = 'Không gọi được dịch vụ: ' + String(e).slice(0, 160); }
  await admin.from('app_secrets').update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_msg: msg }).eq('name', name);
  return json({ ok, msg });
});
