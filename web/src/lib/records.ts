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
  if (t) { const r = await render(t, o, b, d, ppl); return { html: `<div style="font-family:'Times New Roman',serif">${r.html}</div>`, landscape: r.landscape }; }
  const { docHtml, wideDoc } = await import('../components/ProcPanel');
  const full = docHtml(o, b, d, ppl); const st = full.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''; const body = full.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? full;
  return { html: `<style>${st.replace(/@page\{[^}]*\}/, '').replace(/body\{/g, '.pdfdoc{')}</style><div class="pdfdoc">${body}</div>`, landscape: wideDoc(b.proc) };
}

/** Tạo PDF từ HTML, kèm dấu (ĐÃ DUYỆT / THẤT BẠI / BẢN TRÌNH DUYỆT) */
async function toPdf(html: string, stamp: { text: string; sub: string; color: string }, landscape: boolean): Promise<Blob> {
  const h2p = (await import('html2pdf.js')).default as unknown as () => { set: (o: unknown) => { from: (el: HTMLElement) => { outputPdf: (t: 'blob') => Promise<Blob> } } };
  const wrap = document.createElement('div');
  wrap.style.cssText = `box-sizing:border-box;width:${landscape ? 1100 : 760}px;background:#fff;color:#000;padding:8px`;
  wrap.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:6px"><div style="border:2.5px solid ${stamp.color};color:${stamp.color};border-radius:6px;padding:4px 12px;text-align:center;transform:rotate(-2deg);font-family:Arial,sans-serif">
    <div style="font-weight:800;font-size:15px;letter-spacing:.06em">${stamp.text}</div><div style="font-size:10.5px">${stamp.sub}</div></div></div>${html}`;
  const hold = document.createElement('div'); hold.style.cssText = 'position:absolute;left:0;top:0;height:0;overflow:hidden;z-index:-1';
  hold.appendChild(wrap); document.body.appendChild(hold);
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
  }
}

/** Lưu một chứng từ PDF cho phiếu */
export async function saveRecord(o: Order, b: Batch, d: Doc, kind: DocRecord['kind'], note = '', level: string | null = null, result: DocRecord['result'] = null): Promise<DocRecord | null> {
  const ppl = await people(); const { data: au } = await sb.rpc('app_uid'); const me = ppl[au as string]?.full_name ?? '';
  const now = new Date();
  const stamp = kind === 'trinh_duyet' ? { text: 'BẢN TRÌNH DUYỆT', sub: `${me} · ${fmt(now)}`, color: '#3A6EA5' }
    : kind === 'duyet' ? { text: level ? 'ĐÃ DUYỆT · ' + level.toUpperCase() : 'ĐÃ DUYỆT', sub: `${me} · ${fmt(now)}`, color: '#1d7a46' }
    : { text: 'THẤT BẠI', sub: `${me} · ${fmt(now)}${note ? ' · ' + note : ''}`, color: '#b42318' };
  const { html, landscape } = await docPrintHtml(o, b, d, ppl);
  const pdf = await toPdf(html, stamp, landscape);
  const path = `records/${o.id}/${b.proc}-${d.company}-${kind}-${now.getTime()}.pdf`;
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
