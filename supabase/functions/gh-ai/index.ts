// QT3 · Đọc ảnh giao hàng bằng Gemini: CCCD (họ tên, số) và BBGH (số biên bản, trang, chữ ký).
// POST { op: 'cccd' | 'bbgh', doc_id, image (base64 jpeg) } kèm JWT. Chỉ người đang làm phiếu (can_act) hoặc người được xem CCCD gọi được.
// Khoá: app_secrets.GOOGLE_API_KEY (Quản trị → Kết nối).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const svc = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const PROMPT: Record<string, string> = {
  cccd: 'Ảnh là thẻ Căn cước công dân (CCCD) Việt Nam, mặt trước. Trả về JSON đúng dạng {"ho_ten": string|null, "so_cccd": string|null}. ho_ten viết hoa có dấu như trên thẻ; so_cccd chỉ gồm chữ số (thường 12 số). Nếu không đọc được hoặc không phải CCCD thì để null.',
  bbgh: 'Ảnh là một trang Biên bản giao hàng (BBGH). Trả về JSON đúng dạng {"so_bbgh": string|null, "trang": "dau"|"cuoi"|"giua"|null, "co_chu_ky": boolean}. so_bbgh là số biên bản / số phiếu in trên trang (nguyên văn, không thêm chữ). trang: "dau" nếu là trang đầu (có tiêu đề biên bản), "cuoi" nếu là trang có phần ký nhận, "giua" nếu ở giữa; biên bản 1 trang có phần ký thì là "cuoi". co_chu_ky = true nếu có chữ ký tay ở phần ký nhận.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const user = createClient(URL_, req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: 'Bearer ' + jwt } } });
    const { data: u } = await user.auth.getUser(jwt); if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401);
    const { op, doc_id, image } = await req.json().catch(() => ({}));
    if (!PROMPT[op] || typeof doc_id !== 'string' || typeof image !== 'string' || image.length > 8_000_000) return json({ error: 'Thiếu dữ liệu' }, 400);
    const { data: ok } = await user.rpc(op === 'cccd' ? 'cccd_ok' : 'can_act', op === 'cccd' ? { p_doc: doc_id } : { p_doc: doc_id });
    if (!ok) return json({ error: 'Bạn không có quyền với phiếu này' }, 403);
    const { data: s } = await svc.from('app_secrets').select('value').eq('name', 'GOOGLE_API_KEY').maybeSingle();
    if (!s?.value) return json({ error: 'Chưa cài Google API key (Quản trị → Kết nối)' }, 412);
    const body = JSON.stringify({ contents: [{ parts: [{ text: PROMPT[op] }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 } });
    let last = '';
    for (const m of MODELS) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.value }, body });
      if (!r.ok) { last = r.status + ' ' + (await r.text()).slice(0, 200); if (r.status === 404) continue; if (r.status === 429) return json({ error: 'Gemini đang quá giới hạn miễn phí, thử lại sau ít phút' }, 429); return json({ error: 'Gemini lỗi: ' + last }, 502); }
      const j = await r.json(); const t = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      let out: Record<string, unknown> = {}; try { out = JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); } catch { return json({ error: 'Không đọc được kết quả' }, 502); }
      if (op === 'cccd') out.so_cccd = out.so_cccd ? String(out.so_cccd).replace(/\D/g, '') || null : null;
      return json({ ok: true, ...out, model: m });
    }
    return json({ error: 'Gemini lỗi: ' + last }, 502);
  } catch (e) { return json({ error: String(e) }, 500); }
});
