// Kết nối BASE.vn – gọi API từ máy chủ, token đọc từ app_secrets (không lộ ra trình duyệt).
// Gọi: POST /functions/v1/base  header x-notify-key  body {op:'call', host:'workflow.base.vn', path:'job/create', tk:'access_token_v2', params:{...}, files:{custom_x:{url|path,name}}}
// Đã thử 05/11/2026: workflows/get, workflow/get, job/create (QT0 = workflow 17275) – token v2 gửi qua tham số access_token_v2.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
async function sec() { const { data } = await db.from('app_secrets').select('name, value'); return Object.fromEntries((data ?? []).map((r) => [r.name, r.value])) as Record<string, string>; }
type F = Record<string, { url?: string; path?: string; name: string }>;
async function call(host: string, path: string, token: string, params: Record<string, string>, tk = 'access_token', files?: F) {
  let body: BodyInit; const headers: Record<string, string> = {};
  if (files && Object.keys(files).length) {
    const fd = new FormData(); fd.append(tk, token); for (const [k, v] of Object.entries(params)) fd.append(k, v);
    for (const [k, f] of Object.entries(files)) {
      let blob: Blob;
      if (f.path) { const { data, error } = await db.storage.from('files').download(f.path); if (error || !data) throw new Error('không tải được file ' + f.path); blob = data; }
      else { const r = await fetch(f.url!); blob = await r.blob(); }
      fd.append(k, blob, f.name);
    }
    body = fd;
  } else { body = new URLSearchParams({ [tk]: token, ...params }); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const r = await fetch(`https://${host}/extapi/v1/${path}`, { method: 'POST', headers, body });
  const t = await r.text(); let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
}
Deno.serve(async (req) => {
  const s = await sec();
  if (req.headers.get('x-notify-key') !== s.NOTIFY_KEY) return json({ error: 'forbidden' }, 403);
  const { op, host = 'workflow.base.vn', path, params = {}, tk, files } = await req.json().catch(() => ({}));
  // Mỗi app Base một token: request.base.vn dùng BASE_REQUEST_TOKEN (nếu có), còn lại BASE_TOKEN (Workflow)
  const token = host.startsWith('request.') && s.BASE_REQUEST_TOKEN ? s.BASE_REQUEST_TOKEN : s.BASE_TOKEN;
  if (!token) return json({ error: 'no token' });
  try { if (op === 'call') return json(await call(host, path, token, params, tk, files)); } catch (e) { return json({ error: String(e) }); }
  return json({ error: 'unknown op' }, 400);
});
