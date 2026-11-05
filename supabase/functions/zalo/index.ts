// Bot Zalo "PMS": liên kết tài khoản + gửi thông báo duyệt.
// Bí mật (token bot, khoá) đọc từ bảng app_secrets bằng service role, không nằm trong mã nguồn.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const APP = 'https://79kaid-jpg.github.io/don-hang-cnc/';
const DOC: Record<string, [string, string]> = {
  F2: ['XNĐH', 'F2'], F3: ['Dự toán NVL (F3)', 'QT2'], PO: ['PO mua NVL', 'QT2'], F5: ['Lệnh gia công + dự toán NVL (F5)', 'QT2'],
  LGH1: ['Lệnh giao hàng chặng 1 CNC → IPC', 'GH'], LGH2: ['Lệnh giao hàng chặng 2 IPC → Hanwa', 'GH']
};
const STEP: Record<string, string> = {
  'qt0.tiep_nhan': 'QT0 · Tiếp nhận', 'qt0.boc_tach': 'QT0 · Bóc tách F1', 'qt0.kiem_tra_f1': 'QT0 · Kiểm tra F1',
  'qt1.xndh': 'QT1 · Lập XNĐH', 'qt1.cho_duyet_xndh': 'QT1 · Duyệt XNĐH', 'qt1.cho_khach': 'QT1 · KH1 → KH2 xác nhận',
  'qt2.b1': 'QT2 · B1 Lập LGC + dự toán NVL', 'qt2.b2': 'QT2 · B2 Duyệt LGC 4 cấp', 'qt2.b3': 'QT2 · B3 Mua NVL (PO)',
  'qt2.b4': 'QT2 · B4 Nhập kho & QC NVL', 'qt2.b5': 'QT2 · B5 Bàn giao NVL', 'qt2.b6': 'QT2 · B6 Gia công & QC TP',
  'qt3.thong_bao': 'QT3 · B2 Thông báo giao + F8', 'qt3.lap_lgh': 'QT3 · B3 Lập lệnh giao hàng', 'qt3.cho_duyet_lgh': 'QT3 · B3 Duyệt LGH',
  'qt3.giao_hang': 'QT3 · B4 Giao hàng + ảnh', 'qt3.ky_bbgh': 'QT3 · B5 Ký & lưu BBGH'
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
      await send(chat, 'Xin chào! Đây là bot thông báo của app PMS.\nĐể nhận thông báo duyệt: mở app → Liên kết Zalo → gửi mã 6 số cho bot này.\n' + APP);
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
  // 4) Bước công việc: vào bước / giao lại / có người nhận / nhắc 50% SLA / quá hạn
  if (op === 'step') {
    if (req.headers.get('x-notify-key') !== s.NOTIFY_KEY) return json({ error: 'forbidden' }, 403);
    const { order_id, step, event, actor } = await req.json();
    const { data: r } = await db.from('order_steps').select('*, orders(code, project)').eq('order_id', order_id).eq('step', step).single();
    if (!r || r.done_at) return json({ ok: true, skipped: 'bước đã đóng' });
    if (event === 'start' && r.returned_at && Date.now() - new Date(r.returned_at).getTime() < 120000) return json({ ok: true, skipped: 'trả về, gửi riêng' });
    const ids = new Set<string>();
    const toSup = event === 'overdue' || event === 'returned';
    const gids = [r.doer_group_id, ...(toSup ? r.supervisor_group_ids : [])].filter(Boolean);
    const { data: gs } = gids.length ? await db.from('work_groups').select('id, name, member_ids').in('id', gids) : { data: [] };
    const grp = (gs ?? []).find((g) => g.id === r.doer_group_id);
    const members: string[] = grp?.member_ids ?? [];
    if (event === 'start' || event === 'assigned' || event === 'remind_half') { if (r.doer_id) ids.add(r.doer_id); else members.forEach((m) => ids.add(m)); }
    if (event === 'claimed') members.filter((m) => m !== actor).forEach((m) => ids.add(m));
    if (toSup) {
      if (r.doer_id) ids.add(r.doer_id); else members.forEach((m) => ids.add(m));
      r.supervisor_ids.forEach((m: string) => ids.add(m));
      (gs ?? []).filter((g) => r.supervisor_group_ids.includes(g.id)).forEach((g) => g.member_ids.forEach((m: string) => ids.add(m)));
    }
    if (actor) ids.delete(actor);
    if (!ids.size) return json({ ok: true, skipped: 'không có người nhận' });
    const { data: ps } = await db.from('profiles').select('id, full_name, zalo_chat_id').in('id', [...ids, ...(actor ? [actor] : []), ...(r.doer_id ? [r.doer_id] : [])]);
    const name = (id: string | null) => ps?.find((p) => p.id === id)?.full_name ?? '';
    const lbl = STEP[step] ?? step; const tab = step.startsWith('qt0') ? 'F1' : step.startsWith('qt1') ? 'F2' : step.startsWith('qt2') ? 'QT2' : 'GH';
    const link = `${APP}#/don/${order_id}?tab=${tab}`;
    const head = `${r.orders.code} · ${r.orders.project}\n${lbl}`;
    const text = event === 'returned' ? `↩️ Đơn bị trả về bước này\n${head}\nNgười trả về: ${name(actor)}\nLý do: ${r.return_note ?? ''}\nHạn mới: ${fmt(r.due_at)}${grp && !r.doer_id ? '\nNhóm ' + grp.name + ': bấm "Nhận việc"' : ''}\n${link}`
      : event === 'claimed' ? `✋ ${name(actor)} đã nhận việc\n${head}\nBạn không cần làm bước này nữa.\n${link}`
      : event === 'overdue' ? `⏰ Quá hạn\n${head}\nHạn: ${fmt(r.due_at)} · Người làm: ${name(r.doer_id) || (grp ? 'nhóm ' + grp.name + ' (chưa ai nhận)' : 'chưa giao')}\n${link}`
      : event === 'remind_half' ? `🔔 Nhắc: chưa ai nhận việc\n${head}\nNhóm ${grp?.name ?? ''} · hạn ${fmt(r.due_at)}\nBấm "Nhận việc" trong app: ${link}`
      : r.doer_id ? `📌 Việc mới cho bạn\n${head}\nHạn: ${fmt(r.due_at)}\n${link}`
      : `📌 Việc mới cho nhóm ${grp?.name ?? ''}\n${head}\nHạn: ${fmt(r.due_at)}\nAi làm thì bấm "Nhận việc": ${link}`;
    const out = [];
    for (const p of ps ?? []) if (ids.has(p.id) && p.zalo_chat_id) out.push(await send(p.zalo_chat_id, text));
    return json({ ok: true, sent: out.length, to: ids.size });
  }
  // 5) Hồ sơ theo swimlane: bản tới lượt người phụ trách (lập / kiểm tra / duyệt từng công ty, hoặc tải bản ký tay)
  if (op === 'doc') {
    if (req.headers.get('x-notify-key') !== s.NOTIFY_KEY) return json({ error: 'forbidden' }, 403);
    const { doc_id } = await req.json();
    const { data: d } = await db.from('docs').select('*, batches(id, proc, title, status, order_id, orders(code, project))').eq('id', doc_id).single();
    if (!d) return json({ ok: false });
    const b = d.batches; const proc = b.proc as string;
    const ROLE: Record<string, string> = proc === 'QT0' ? { tiep_nhan: 'admin', boc_tach: 'ky_thuat', tao_ds: 'admin', kiem_tra: 'kiem_tra', duyet: 'duyet' } : { lap: 'lap', kiem_tra: 'kiem_tra', duyet: 'duyet' };
    const STL: Record<string, string> = { tiep_nhan: 'Admin tiếp nhận', boc_tach: 'Bóc tách kỹ thuật', tao_ds: 'Tạo danh sách tấm', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', lap: 'Lập' };
    const CO: Record<string, string> = { PN: 'Phương Nam CNC', IPC: 'IPC', HW: 'Hanwha' };
    const FIN: Record<string, string> = { QT1: 'khách ký xác nhận', QT2: 'ký bàn giao / nhận vật liệu', QT3: 'khách ký nhận hàng' };
    let company = d.company, role = ROLE[d.status], what = '';
    if (d.status === 'da_duyet' && proc !== 'QT0' && d.company === 'HW') { company = 'PN'; role = 'hoan_tat'; what = `Cả 3 công ty đã duyệt. Bước cuối: ${FIN[proc]} – in bản, ký tay, tải lên.`; }
    let lvName = '';
    if (d.status === 'duyet_them') { const lid = d.apv?.queue?.[d.apv?.idx ?? 0]; const { data: lv } = await db.from('approval_levels').select('*').eq('id', lid).maybeSingle();
      if (!lv) return json({ ok: true, skipped: 'no level' }); role = 'level'; lvName = lv.name; STL.duyet_them = lv.name; (d as Record<string, unknown>)._lv = lv; }
    if (!role) return json({ ok: true, skipped: d.status });
    const lv0 = (d as Record<string, unknown>)._lv as { user_id: string | null; group_id: string | null } | undefined;
    const { data: cp } = lv0 ? { data: [lv0] } : await db.from('chain_people').select('*').eq('proc', proc).eq('company', company).in('role', role === 'hoan_tat' ? ['hoan_tat', 'lap'] : [role]);
    const ids = new Set<string>();
    for (const c of cp ?? []) { if (c.user_id) ids.add(c.user_id); if (c.group_id) { const { data: g } = await db.from('work_groups').select('member_ids, active').eq('id', c.group_id).single(); if (g?.active) g.member_ids.forEach((m: string) => ids.add(m)); } }
    const today = new Date().toISOString().slice(0, 10);
    const { data: dl } = await db.from('delegations').select('user_id, to_user').lte('from_date', today).gte('to_date', today);
    for (const x of dl ?? []) if (ids.has(x.user_id)) ids.add(x.to_user);
    const last = (d.signs ?? []).at(-1); if (last?.user) ids.delete(last.user);
    void lvName;
    if (!ids.size) return json({ ok: true, skipped: 'không có người nhận' });
    const back = last?.action === 'tra_ve';
    const link = `${APP}#/don/${b.order_id}?tab=${proc}`;
    const head = `${b.orders.code} · ${b.orders.project}\n${proc} · ${b.title}${proc === 'QT0' ? '' : ' · ' + CO[d.company]}`;
    const text = what ? `✍ ${head}\n${what}\n${link}` : back ? `↩️ Bị trả về – ${STL[d.status]}\n${head}\nLý do: ${last?.note ?? ''}\n${link}` : `📌 Đến lượt bạn: ${STL[d.status]}${proc === 'QT0' ? '' : ' (' + CO[company] + ')'}\n${head}\n${link}`;
    const { data: ps } = await db.from('profiles').select('id, zalo_chat_id').in('id', [...ids]);
    let n = 0; for (const p of ps ?? []) if (p.zalo_chat_id) { await send(p.zalo_chat_id, text); n++; }
    return json({ ok: true, sent: n, to: ids.size });
  }
  return json({ error: 'unknown op' }, 400);
});
