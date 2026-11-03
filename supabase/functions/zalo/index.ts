// Bot Zalo "Đơn hàng CNC": liên kết tài khoản + gửi thông báo duyệt.
// Bí mật (token bot, khoá) đọc từ bảng app_secrets bằng service role, không nằm trong mã nguồn.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const APP = 'https://79kaid-jpg.github.io/don-hang-cnc/';
const DOC: Record<string, [string, string]> = {
  F2: ['XNĐH', 'F2'], F3: ['Dự toán NVL (F3)', 'QT2'], PO: ['PO mua NVL', 'QT2'], F5: ['Lệnh gia công + dự toán NVL (F5)', 'QT2'],
  LGH1: ['Lệnh giao hàng chặng 1 CNC → IPC', 'GH'], LGH2: ['Lệnh giao hàng chặng 2 IPC → Hanwa', 'GH']
};
let cache: Record<string, string> | null = null;
async function secrets() {
  if (!cache) { const { data } = await db.from('app_secrets').select('name, value'); cache = Object.fromEntries((data ?? []).map((r) => [r.name, r.value])); }
  return cache;
}
async function zalo(method: string, body: unknown) {
  const s = await secrets();
  const r = await fetch(`https://bot-api.zaloplatforms.com/bot${s.ZALO_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {})
  });
  return await r.json().catch(() => ({ ok: false, status: r.status }));
}
const send = (chat_id: string, text: string) => zalo('sendMessage', { chat_id, text: text.slice(0, 2000) });
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const url = new URL(req.url); const op = url.searchParams.get('op'); const s = await secrets();

  // 1) Cài webhook cho bot (gọi một lần)
  if (op === 'setup') {
    if (url.searchParams.get('k') !== s.WEBHOOK_KEY) return json({ error: 'forbidden' }, 403);
    const hook = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zalo?op=webhook&k=${s.WEBHOOK_KEY}`;
    return json({ me: await zalo('getMe', {}), webhook: await zalo('setWebhook', { url: hook, secret_token: s.WEBHOOK_KEY }) });
  }

  // 2) Zalo gửi tin nhắn người dùng tới bot
  if (op === 'webhook') {
    if (url.searchParams.get('k') !== s.WEBHOOK_KEY) return json({ error: 'forbidden' }, 403);
    const u = await req.json().catch(() => ({}));
    const upd = u.result ?? u; const m = upd.message;
    const chat = m?.chat?.id ? String(m.chat.id) : null;
    if (!chat) return json({ ok: true });
    const text = String(m.text ?? '').trim();
    const code = text.match(/\b(\d{6})\b/)?.[1];
    if (code) {
      const { data: c } = await db.from('zalo_link_codes').select('user_id, expires_at').eq('code', code).maybeSingle();
      if (!c || new Date(c.expires_at) < new Date()) { await send(chat, 'Mã không đúng hoặc đã hết hạn. Vào app → Tài khoản → Liên kết Zalo để lấy mã mới.'); return json({ ok: true }); }
      const name = m.from?.display_name ?? m.from?.name ?? '';
      await db.from('profiles').update({ zalo_chat_id: chat, zalo_name: name }).eq('id', c.user_id);
      await db.from('zalo_link_codes').delete().eq('code', code);
      const { data: p } = await db.from('profiles').select('full_name').eq('id', c.user_id).single();
      await send(chat, `Đã liên kết Zalo với tài khoản ${p?.full_name}. Từ giờ bạn sẽ nhận thông báo khi đến lượt duyệt phiếu.`);
    } else {
      await send(chat, 'Xin chào! Đây là bot thông báo của app Đơn hàng CNC.\nĐể nhận thông báo duyệt: mở app → Liên kết Zalo → gửi mã 6 số cho bot này.\n' + APP);
    }
    return json({ ok: true });
  }

  // 3) CSDL báo có lượt duyệt mới / bị từ chối
  if (op === 'approval') {
    if (req.headers.get('x-notify-key') !== s.NOTIFY_KEY) return json({ error: 'forbidden' }, 403);
    const { approval_id, event } = await req.json();
    const { data: a } = await db.from('approvals').select('*, orders(id, code, project, created_by)').eq('id', approval_id).single();
    if (!a) return json({ ok: false, error: 'not found' });
    const [docName, tab] = DOC[a.doc_type] ?? [a.doc_type, 'LS'];
    const link = `${APP}#/don/${a.order_id}?tab=${tab}`;
    let to: string | null = null; let text = '';
    if (event === 'cho') {
      to = a.approver_id;
      text = `🔔 Chờ bạn duyệt\n${a.orders.code} · ${a.orders.project}\n${docName} · cấp ${a.step_no}: ${a.label}\nHạn: ${fmt(a.due_at)}\nMở phiếu: ${link}`;
    } else {
      // từ chối → báo người tạo đơn
      to = a.orders.created_by;
      const { data: who } = await db.from('profiles').select('full_name').eq('id', a.approver_id).single();
      text = `❌ Phiếu bị từ chối\n${a.orders.code} · ${docName} · cấp ${a.step_no}\nNgười từ chối: ${who?.full_name ?? ''}\nLý do: ${a.note ?? ''}\nMở phiếu: ${link}`;
    }
    const { data: p } = await db.from('profiles').select('zalo_chat_id').eq('id', to).maybeSingle();
    if (!p?.zalo_chat_id) return json({ ok: true, skipped: 'chưa liên kết Zalo' });
    return json({ ok: true, zalo: await send(p.zalo_chat_id, text) });
  }
  return json({ error: 'unknown op' }, 400);
});
