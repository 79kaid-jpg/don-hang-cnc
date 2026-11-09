import { sb, type Order, type Profile } from './supabase';
import type { Batch, Doc } from './proc';

/** Chứng từ: PDF trình duyệt / đã duyệt (mỗi cấp) / thất bại – lưu cố định theo công ty */
export type DocRecord = { id: string; order_id: string; doc_id: string; proc: string; company: string; batch_title: string; kind: 'trinh_duyet' | 'duyet' | 'tu_choi';
  level_name: string | null; result: 'thanh_cong' | 'that_bai' | null; path: string; note: string; by_user: string | null; at: string };

const fmt = (d: Date) => d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function people(): Promise<Record<string, Profile>> {
  const { data } = await sb.from('profiles').select('*'); return Object.fromEntries(((data as Profile[]) ?? []).map((p) => [p.id, p]));
}

/** HTML bản in của phiếu: mẫu Excel nếu có, không thì bản in mặc định */
async function docPrintHtml(o: Order, b: Batch, d: Doc, ppl: Record<string, Profile>): Promise<{ html: string; landscape: boolean }> {
  const { getTpl, render } = await import('../components/PrintTpl');
  const t = await getTpl(b.proc, d.company);
  if (t) { const r = await render(t, o, b, d, ppl); return { html: `<div style="font-family:'Be Vietnam Pro',system-ui,sans-serif">${r.html}</div>`, landscape: r.landscape }; }
  const { docHtml, wideDoc } = await import('../components/ProcPanel');
  const full = docHtml(o, b, d, ppl); const st = full.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''; const body = full.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? full;
  return { html: `<style>${st.replace(/@page\{[^}]*\}/, '').replace(/body\{/g, '.pdfdoc{')}</style><div class="pdfdoc">${body}</div>`, landscape: wideDoc(b.proc) };
}

/** Tạo PDF từ HTML, kèm dấu (ĐÃ DUYỆT / THẤT BẠI / BẢN TRÌNH DUYỆT) */
async function toPdf(html: string, stamp: { text: string; sub: string; color: string }, landscape: boolean): Promise<Blob> {
  const h2p = (await import('html2pdf.js')).default as unknown as () => { set: (o: unknown) => { from: (el: HTMLElement) => { outputPdf: (t: 'blob') => Promise<Blob> } } };
  const wrap = document.createElement('div');
  wrap.style.cssText = `box-sizing:border-box;width:${landscape ? 1100 : 760}px;background:#fff;color:#000;padding:8px`;
  wrap.style.position = 'relative';
  wrap.innerHTML = `${html}<div data-stamp style="position:absolute;right:4px;top:112px;border:1.5px solid ${stamp.color};color:${stamp.color};border-radius:4px;padding:2px 8px;text-align:center;transform:rotate(-2deg);font-family:'Be Vietnam Pro',system-ui,sans-serif;background:#fff;line-height:1.25">
    <div style="font-weight:800;font-size:10px;letter-spacing:.05em">${stamp.text}</div><div style="font-size:8px">${stamp.sub}</div></div>`;
  const hold = document.createElement('div'); hold.style.cssText = 'position:absolute;left:0;top:0;height:0;overflow:hidden;z-index:-1';
  hold.appendChild(wrap); document.body.appendChild(hold);
  { // dấu đặt ngay dưới dòng "Ngày in" (góc phải đầu trang), không đè lên dòng logo
    const st = wrap.querySelector<HTMLElement>('[data-stamp]'); const w0 = wrap.getBoundingClientRect().top;
    const cell = [...wrap.querySelectorAll<HTMLElement>('td,th,div,p,span')].filter((e) => /Ngày in/i.test(e.textContent ?? '') && e.children.length === 0).pop()
      ?? [...wrap.querySelectorAll<HTMLElement>('td')].find((e) => /Ngày in/i.test(e.textContent ?? ''));
    if (st && cell) st.style.top = Math.round(cell.getBoundingClientRect().bottom - w0 + 4) + 'px';
  }
  // Ngắt trang không cắt ngang dòng bảng: chèn khoảng trống trước dòng sẽ bị cắt
  const W = landscape ? 1100 : 760; const pageMm = landscape ? [297, 210] : [210, 297];
  keepRows(wrap, Math.floor(W * (pageMm[1] - 6 - 8) / (pageMm[0] - 6 - 6)));
  try {
    return await h2p().set({ margin: [6, 6, 8, 6], filename: 'chung-tu.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: landscape ? 1100 : 760, windowWidth: (landscape ? 1100 : 760) + 40, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(wrap).outputPdf('blob');
  } finally { hold.remove(); }
}

/** Đẩy dòng bảng bị vắt qua ranh giới trang sang trang sau */
export function keepRows(root: HTMLElement, pageH: number) {
  const top0 = root.getBoundingClientRect().top;
  for (const tr of Array.from(root.querySelectorAll('tr'))) {
    const r = tr.getBoundingClientRect(); const t = r.top - top0, b = r.bottom - top0;
    if (r.height >= pageH || r.height === 0) continue;
    const pg = Math.floor(t / pageH); if (Math.floor((b - 1) / pageH) === pg) continue;
    const gap = (pg + 1) * pageH - t; const sp = document.createElement('tr');
    sp.innerHTML = `<td colspan="99" style="height:${gap}px;padding:0;border:none;border-left:none;border-right:none;background:#fff"></td>`;
    tr.parentNode!.insertBefore(sp, tr);
    // lặp lại dòng tiêu đề của bảng ở đầu trang mới
    const g = tr.getAttribute('data-g');
    if (g != null) for (const hr of Array.from(root.querySelectorAll(`tr[data-h="${g}"]`))) { const c = hr.cloneNode(true) as HTMLElement; c.removeAttribute('data-h'); tr.parentNode!.insertBefore(c, tr); }
  }
}

/** Bảng "Nhật ký phê duyệt" in cuối mỗi chứng từ lưu trữ: ai làm bước nào, khi nào */
async function auditHtml(d: Doc, ppl: Record<string, Profile>, level: string | null): Promise<string> {
  const { ROLE_NAME } = await import('./proc');
  const t = (x: string) => new Date(x).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const act: Record<string, string> = { ky: 'Đã ký', next: 'Đã ký', back: 'Trả về', fail: 'Thất bại' };
  const e = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const rows = (d.signs ?? []).map((s, i) => { const lv = (s as { level?: string | null }).level;
    return `<tr><td style="text-align:center">${i + 1}</td><td>${e(lv ?? (s.role === 'duyet' && level && i === d.signs.length - 1 ? level : ROLE_NAME[s.role] ?? s.role))}</td><td><b>${e(ppl[s.user]?.full_name ?? '—')}</b></td><td>${act[s.action] ?? e(s.action)}</td><td style="white-space:nowrap">${s.at ? t(s.at) : ''}</td><td>${e(s.note ?? '')}</td></tr>`; }).join('');
  if (!rows) return '';
  const td = 'border:1px solid #94A3B8;padding:4px 6px;font-size:10.5px;vertical-align:top';
  return `<div style="page-break-inside:avoid;break-inside:avoid;margin-top:14px;font-family:'Be Vietnam Pro',system-ui,sans-serif">
    <div style="font-weight:700;font-size:12px;margin:0 0 4px;color:#1F3A93">NHẬT KÝ PHÊ DUYỆT</div>
    <table style="width:100%;border-collapse:collapse">${'<tr>' + ['STT', 'Bước', 'Người thực hiện', 'Hành động', 'Thời gian', 'Ghi chú'].map((h) => `<th style="${td};background:#EEF2F7;text-align:left">${h}</th>`).join('') + '</tr>'}
    ${rows.replace(/<td/g, `<td style="${td}"`).replace(/<td style="([^"]*)" style="([^"]*)"/g, '<td style="$1;$2"')}</table>
    <div style="font-size:9px;color:#64748B;margin-top:3px">Chứng từ lưu trữ tạo tự động bởi hệ thống – không chỉnh sửa được.</div></div>`;
}

/** Lưu một chứng từ PDF cho phiếu */
export async function saveRecord(o: Order, b: Batch, d: Doc, kind: DocRecord['kind'], note = '', level: string | null = null, result: DocRecord['result'] = null, as?: { user: string; at: string }, ppl0?: Record<string, Profile>): Promise<DocRecord | null> {
  const ppl = ppl0 ?? await people(); const au = as?.user ?? (await sb.rpc('app_uid')).data; const me = ppl[au as string]?.full_name ?? '';
  const now = as ? new Date(as.at) : new Date();
  const stamp = kind === 'trinh_duyet' ? { text: 'BẢN TRÌNH DUYỆT', sub: `${me} · ${fmt(now)}`, color: '#3A6EA5' }
    : kind === 'duyet' ? { text: level ? 'ĐÃ DUYỆT · ' + level.toUpperCase() : 'ĐÃ DUYỆT', sub: `${me} · ${fmt(now)}`, color: '#1d7a46' }
    : { text: 'THẤT BẠI', sub: `${me} · ${fmt(now)}${note ? ' · ' + note : ''}`, color: '#b42318' };
  // Bản duyệt/thất bại: thêm chữ ký của người đang thao tác (chưa có trong d.signs lúc tạo PDF)
  const { ROLE_OF } = await import('./proc');
  const signs = [...(d.signs ?? [])];
  if (!as && kind !== 'trinh_duyet') signs.push({ role: ROLE_OF[d.status] ?? d.status, user: au as string, at: now.toISOString(), action: kind === 'tu_choi' ? 'fail' : 'ky', note });
  else if (!as && kind === 'trinh_duyet') signs.push({ role: ROLE_OF[d.status] ?? d.status, user: au as string, at: now.toISOString(), action: 'ky', note });
  const d2 = { ...d, signs } as Doc;
  const { html: h0, landscape } = await docPrintHtml(o, b, d2, ppl);
  const html = h0 + await auditHtml(d2, ppl, level);
  const pdf = await toPdf(html, stamp, landscape);
  const path = `records/${o.id}/${b.proc}-${d.company}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.pdf`;
  const up = await sb.storage.from('files').upload(path, pdf, { contentType: 'application/pdf' }); if (up.error) throw up.error;
  const { data, error } = await sb.from('doc_records').insert({ order_id: o.id, doc_id: d.id, proc: b.proc, company: d.company, batch_title: b.title, kind, level_name: level, result, path, note }).select('*').single();
  if (error) throw error; return data as DocRecord;
}

/** Ký / thất bại kèm lưu chứng từ:
 *  - gửi sang bước Duyệt → "Bản trình duyệt"
 *  - Duyệt / Duyệt thêm → "Đã duyệt" (mỗi cấp một bản; cấp cuối = Thành công)
 *  - Thất bại → "Thất bại" */
export async function advanceDoc(o: Order, b: Batch, d: Doc & { apv?: { queue: string[]; idx: number } | null }, action: 'next' | 'back' | 'fail', note: string): Promise<{ next: string; warn?: string }> {
  const { FLOW } = await import('./proc');
  const fl = FLOW[b.proc as keyof typeof FLOW]; const i = fl.indexOf(d.status);
  let rec: DocRecord | null = null; let warn: string | undefined;
  const lvName = async () => { if (d.status !== 'duyet_them' || !d.apv) return null; const id = d.apv.queue[d.apv.idx]; const { data } = await sb.from('approval_levels').select('name').eq('id', id).maybeSingle(); return (data as { name: string } | null)?.name ?? null; };
  try {
    if (action === 'next' && fl[i + 1] === 'duyet') rec = await saveRecord(o, b, d, 'trinh_duyet', note);
    else if (action === 'next' && (d.status === 'duyet' || d.status === 'duyet_them')) rec = await saveRecord(o, b, d, 'duyet', note, d.status === 'duyet_them' ? await lvName() : 'Duyệt');
    else if (action === 'fail') rec = await saveRecord(o, b, d, 'tu_choi', note, null, 'that_bai');
  } catch (e) { warn = 'Chưa lưu được chứng từ PDF: ' + ((e as Error).message ?? e); }
  const { data, error } = await sb.rpc('doc_advance', { p_doc: d.id, p_action: action, p_note: note });
  if (error) { if (rec) await sb.from('doc_records').update({ note: '(đã huỷ – ký không thành công) ' + rec.note }).eq('id', rec.id); throw error; }
  if (rec && rec.kind === 'duyet' && data === 'da_duyet') await sb.from('doc_records').update({ result: 'thanh_cong' }).eq('id', rec.id);
  return { next: data as string, warn };
}

export const recordUrl = async (path: string) => (await sb.storage.from('files').createSignedUrl(path, 3600)).data?.signedUrl ?? '';

/** Admin: tạo bù PDF "Đã duyệt"/"Thất bại" cho phiếu đã kết thúc mà chưa có chứng từ (VD đơn chạy mô phỏng) */
export async function backfillRecords(onStep?: (done: number, total: number, label: string) => void, limit = 10000, redo = false): Promise<{ ok: number; err: number }> {
  const ppl = await people();
  const { data: ds } = await sb.from('docs_v').select('*').in('status', ['da_duyet', 'fail']);
  const { data: rs } = await sb.from('doc_records').select('id, doc_id, kind, note').in('kind', ['duyet', 'tu_choi']);
  const recs = ((rs ?? []) as { id: string; doc_id: string; note: string }[]).filter((r) => !r.note.startsWith('(đã huỷ'));
  const have = new Set(recs.filter((r) => !redo || !r.note.startsWith('(tạo bù)')).map((r) => r.doc_id));
  const old = (id: string) => recs.filter((r) => r.doc_id === id && r.note.startsWith('(tạo bù)')).map((r) => r.id);
  const todo = ((ds ?? []) as Doc[]).filter((d) => !have.has(d.id)).slice(0, limit);
  const bc: Record<string, Batch> = {}; const oc: Record<string, Order> = {}; let ok = 0, err = 0;
  for (const [i, d] of todo.entries()) {
    try {
      const b = bc[d.batch_id] ??= (await sb.from('batches').select('*').eq('id', d.batch_id).single()).data as Batch;
      const o = oc[b.order_id] ??= (await sb.from('orders').select('*').eq('id', b.order_id).single()).data as Order;
      const sg = [...(d.signs ?? [])].reverse().find((x) => d.status === 'fail' ? x.action === 'fail' : x.action === 'next' || x.action === 'ky') ?? { user: '', at: d.status_at };
      const as = { user: sg.user, at: sg.at ?? d.status_at };
      if (d.status === 'fail') await saveRecord(o, b, d, 'tu_choi', '(tạo bù) ' + ((sg as { note?: string }).note ?? ''), null, 'that_bai', as, ppl);
      else await saveRecord(o, b, d, 'duyet', '(tạo bù)', 'Duyệt', 'thanh_cong', as, ppl);
      const ids = old(d.id); if (ids.length) await sb.from('doc_records').update({ note: '(đã huỷ – thay bằng bản mới) (tạo bù)' }).in('id', ids);
      ok++;
    } catch (e) { err++; console.warn('backfill', d.id, e); }
    onStep?.(i + 1, todo.length, d.id);
  }
  return { ok, err };
}
