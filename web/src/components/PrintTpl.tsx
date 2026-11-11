import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb, errText, type Customer, type Order, type Profile } from '../lib/supabase';
import { PROC_NAME, type Batch, type Doc, type Proc } from '../lib/proc';
import { parties, type TplImg, buildData, downloadWb, fillXlsx, printHtml, isLandscape, scanVars, toHtml, varList, type Tpl } from '../lib/xlsxTpl';
import { Icon } from './Icon';
import { QtTag } from './QtTag';
import { toast } from './ui';

const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const CO: Record<string, string> = { '': 'Cả 3 công ty', PN: 'Phương Nam', IPC: 'IPC', HW: 'Hanwa' };
const loadBuf = async (t: Tpl) => { const { data, error } = await sb.storage.from('files').download(t.path); if (error || !data) throw error ?? new Error('Không tải được mẫu'); return data.arrayBuffer(); };
const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_');

/** Mẫu đang dùng cho quy trình + công ty: ưu tiên mẫu riêng công ty, sau đó mẫu chung */
/** Tải logo từ kho, đổi sang base64 (PNG/JPEG) kèm kích thước */
async function loadImg(path: string): Promise<TplImg | null> {
  const { data } = await sb.storage.from('files').download(path); if (!data) return null;
  const bmp = await createImageBitmap(data); const cv = document.createElement('canvas'); const k = Math.min(1, 1200 / bmp.width); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return { base64: cv.toDataURL('image/png').split(',')[1], ext: 'png', w: cv.width, h: cv.height };
}

/** Mẫu in đang dùng cho QT + công ty */
export async function getTpl(proc: string, company: string): Promise<Tpl | null> {
  const { data } = await sb.from('print_templates').select('*').eq('proc', proc).eq('active', true).order('version', { ascending: false });
  const l = (data as Tpl[]) ?? []; return l.find((x) => x.company === company) ?? l.find((x) => !x.company) ?? null;
}

export function useTpl(proc: string, company: string) {
  const [t, setT] = useState<Tpl | null>(null);
  useEffect(() => { sb.from('print_templates').select('*').eq('proc', proc).eq('active', true).order('version', { ascending: false })
    .then(({ data }) => { const l = (data as Tpl[]) ?? []; setT(l.find((x) => x.company === company) ?? l.find((x) => !x.company) ?? null); }); }, [proc, company]);
  return t;
}

export async function render(t: Tpl, o: Order, b: Batch, d: Doc, people: Record<string, Profile>) {
  const { data } = await sb.from('customers').select('*'); const cs = (data as Customer[]) ?? []; const cust = Object.fromEntries(cs.map((c) => [c.id, c.name]));
  const td = buildData(o, b, d, people, cust, cs.find((c) => c.id === (o.customer_id ?? o.kh2_id ?? o.kh1_id)), cs);
  const pt = parties(o, d.company, b.proc, cs, (d.header as Record<string, string> | undefined)?.end_customer_id); td.images = {};
  for (const [k, c] of [['ben_ban_logo', pt.seller], ['kh_logo', pt.buyer]] as const) { const im = c?.logo_path ? await loadImg(c.logo_path) : null; if (im) td.images[k] = im; }
  const wb = await fillXlsx(await loadBuf(t), td); return { wb, html: toHtml(wb), landscape: isLandscape(wb) };
}

function Preview({ html, title, landscape = true, onXlsx, onTpl, onClose }: { html: string; title: string; landscape?: boolean; onXlsx: () => void; onTpl?: () => void; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return createPortal(<div className="pt-ov" onClick={onClose}>
    <div className="pt-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
      <header><b>{title}</b><span style={{ flex: 1 }} />
        {onTpl && <button className="btn sm" onClick={onTpl} title="File mẫu còn nguyên các biến {…} – dùng file này để chỉnh sửa rồi tải lên lại"><Icon name="download" size={15} />Tải mẫu gốc (có biến) để sửa</button>}
        <button className="btn sm" onClick={onXlsx} title={onTpl ? 'Bản đã điền dữ liệu thử – chỉ để xem, không dùng làm mẫu' : ''}><Icon name="download" size={15} />{onTpl ? 'Excel bản thử' : 'Excel'}</button>
        <button className="btn sm primary" onClick={() => printHtml(html, title, landscape)}><Icon name="print" size={15} />In / PDF</button>
        <button className="btn sm icon" aria-label="Đóng" onClick={onClose}><Icon name="x" size={16} /></button></header>
      <div className="pt-paper"><div dangerouslySetInnerHTML={{ __html: html }} /></div>
    </div></div>, document.body);
}

/** Nút trên phiếu: điền mẫu → xem trước → tải Excel / in PDF */
export function PrintTplButton({ o, b, d, people, big, fallback }: { o: Order; b: Batch; d: Doc; people: Record<string, Profile>; big?: boolean; fallback?: () => void }) {
  const t = useTpl(b.proc, d.company); const [pv, setPv] = useState<{ html: string; landscape?: boolean; wb: Awaited<ReturnType<typeof render>>['wb'] } | null>(null); const [busy, setBusy] = useState(false);
  if (!t) return fallback ? <button className="btn xs" onClick={fallback} title="In / lưu PDF (bản in mặc định – chưa có mẫu Excel)"><Icon name="print" size={13} />In</button> : null;
  const name = safe(`${t.name}_${o.code}_${d.company}`) + '.xlsx';
  const go = async () => { setBusy(true); try { setPv(await render(t, o, b, d, people)); } catch (e) { toast(errText(e as Error)); } setBusy(false); };
  return <>
    <button className={big ? 'btn sm primary pt-big' : 'btn xs'} disabled={busy} onClick={go} title={big ? undefined : 'In theo mẫu Excel / lưu PDF'}><Icon name={big ? 'file' : 'print'} size={big ? 15 : 13} />{busy ? 'Đang tạo…' : big ? 'In mẫu cho khách ký' : 'In'}</button>
    {pv && <Preview html={pv.html} landscape={pv.landscape} title={t.name + ' · ' + o.code} onXlsx={() => downloadWb(pv.wb, name)} onClose={() => setPv(null)} />}
  </>;
}

/** Quản trị → Mẫu in */
export function PrintTemplates({ canEdit }: { canEdit: boolean }) {
  const [proc, setProc] = useState<Proc>('QT1'); const [list, setList] = useState<Tpl[]>([]);
  const [up, setUp] = useState<{ file: File; buf: ArrayBuffer; vars: string[]; name: string; company: string } | null>(null); const [busy, setBusy] = useState(false);
  const [pv, setPv] = useState<{ html: string; landscape?: boolean; wb: Awaited<ReturnType<typeof render>>['wb']; t: Tpl } | null>(null);
  const known = new Set(varList(proc).map((v) => v.k));
  const load = () => sb.from('print_templates').select('*').eq('proc', proc).order('created_at', { ascending: false }).then(({ data }) => setList((data as Tpl[]) ?? []));
  useEffect(() => { load(); setUp(null); }, [proc]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { toast('Chỉ nhận file Excel .xlsx'); return; }
    try { const buf = await f.arrayBuffer(); setUp({ file: f, buf, vars: await scanVars(buf), name: f.name.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' '), company: '' }); }
    catch { toast('Không đọc được file. Lưu lại bằng Excel (.xlsx) rồi thử lại.'); } };
  const save = async () => { if (!up) return; setBusy(true);
    const path = `templates/${proc}/${Date.now()}-${safe(up.file.name)}`;
    const r = await sb.storage.from('files').upload(path, up.file); if (r.error) { toast(errText(r.error)); setBusy(false); return; }
    const same = list.filter((x) => (x.company ?? '') === up.company); const ver = Math.max(0, ...same.map((x) => x.version)) + 1;
    if (same.length) await sb.from('print_templates').update({ active: false }).eq('proc', proc).in('id', same.map((x) => x.id));
    const { error } = await sb.from('print_templates').insert({ proc, company: up.company || null, name: up.name, path, file_name: up.file.name, version: ver, vars: up.vars, active: true });
    setBusy(false); if (error) toast(errText(error)); else { toast('Đã lưu mẫu – phiên bản ' + ver); setUp(null); load(); } };
  const toggle = async (t: Tpl) => { if (!t.active) await sb.from('print_templates').update({ active: false }).eq('proc', proc).filter('company', t.company ? 'eq' : 'is', t.company ?? null);
    await sb.from('print_templates').update({ active: !t.active }).eq('id', t.id); load(); };
  const dl = async (t: Tpl) => { const b = await loadBuf(t); const u = URL.createObjectURL(new Blob([b])); const a = document.createElement('a'); a.href = u; a.download = t.file_name ?? 'mau.xlsx'; a.click(); };
  const test = async (t: Tpl) => { setBusy(true);
    try {
      let q = sb.from('docs_v').select('*, batches!inner(*)').eq('batches.proc', proc).order('status_at', { ascending: false }).limit(1); if (t.company) q = q.eq('company', t.company);
      const { data: ds } = await q; const d = (ds as (Doc & { batches: Batch })[] | null)?.[0]; if (!d) { toast('Chưa có phiếu ' + proc + ' nào để thử'); setBusy(false); return; }
      const { data: o } = await sb.from('orders').select('*').eq('id', d.batches.order_id).single(); const { data: ps } = await sb.from('profiles').select('*');
      const people = Object.fromEntries(((ps as Profile[]) ?? []).map((p) => [p.id, p]));
      setPv({ ...(await render(t, o as Order, d.batches, d, people)), t });
    } catch (e) { toast(errText(e as Error)); }
    setBusy(false); };
  const copy = (k: string) => { navigator.clipboard?.writeText('{' + k + '}'); toast('Đã chép {' + k + '}'); };

  return <div className="af">
    <div className="af-pick"><div className="seg" role="tablist">{PROCS.map((p) => <button key={p} role="tab" aria-pressed={proc === p} onClick={() => setProc(p)}>{p}</button>)}</div></div>
    <div className="pt-grid">
      <section className="af-card">
        <header><QtTag qt={proc} /><b>Mẫu in · {PROC_NAME[proc]}</b></header>
        {list.length === 0 && <div className="small muted">Chưa có mẫu. Phiếu sẽ dùng bản in mặc định của app.</div>}
        <ul className="pt-list">{list.map((t) => <li key={t.id} className={t.active ? '' : 'off'}>
          <span className="pt-ic"><Icon name="file" size={18} /></span>
          <div className="pt-b"><b>{t.name}</b><span className="small muted">{CO[t.company ?? '']} · v{t.version} · {new Date(t.created_at).toLocaleDateString('vi-VN')} · {t.vars.length} biến{t.active ? '' : ' · đang tắt'}</span></div>
          <span className="pt-act"><button className="btn sm" disabled={busy} onClick={() => test(t)}><Icon name="eye" size={14} />Thử</button>
            <button className="btn sm icon" aria-label="Tải file mẫu gốc (có biến)" title="Tải file mẫu gốc (có biến) để chỉnh sửa" onClick={() => dl(t)}><Icon name="download" size={14} /></button>
            {canEdit && <button className="btn sm" onClick={() => toggle(t)}>{t.active ? 'Tắt' : 'Dùng'}</button>}</span>
        </li>)}</ul>
        {canEdit && !up && <label className="pt-drop"><Icon name="upload" size={20} /><span><b>Tải mẫu Excel (.xlsx)</b><br /><span className="small muted">Gõ biến vào ô, ví dụ {'{so_lenh}'} · dòng bảng bắt đầu bằng {'{#nl}'}</span></span>
          <input type="file" accept=".xlsx" hidden onChange={pick} /></label>}
        {up && <div className="af-edit">
          <div className="af-row"><label className="f"><span>Tên mẫu</span><input value={up.name} onChange={(e) => setUp({ ...up, name: e.target.value })} /></label>
            <label className="f" style={{ maxWidth: 170 }}><span>Áp dụng cho</span><select value={up.company} onChange={(e) => setUp({ ...up, company: e.target.value })}>
              {Object.entries(CO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
          <div className="small"><b>{up.vars.length} biến tìm thấy</b> trong {up.file.name}</div>
          <div className="pt-vars">{up.vars.map((v) => <span key={v} className={'pt-v' + (known.has(v) ? '' : ' bad')} title={known.has(v) ? '' : 'Biến không có – sẽ để trống'}>{'{' + v + '}'}</span>)}</div>
          {up.vars.some((v) => !known.has(v)) && <div className="msg err"><Icon name="alert" size={16} /><span>Biến màu đỏ không có trong {proc} – sẽ để trống khi in. Kiểm tra lại chính tả.</span></div>}
          {!up.vars.length && <div className="msg err"><Icon name="alert" size={16} /><span><b>File này không có biến nào</b> – mọi đơn sẽ in ra cùng một nội dung cố định. Có thể bạn đang tải lên bản <i>đã điền dữ liệu</i> (nút "Excel bản thử"). Hãy dùng nút tải <b>mẫu gốc (có biến)</b>, sửa trên đó rồi tải lên lại; hoặc gõ {'{ten_bien}'} vào các ô cần điền.</span></div>}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={() => setUp(null)}>Huỷ</button>
            <button className="btn primary" disabled={busy || !up.name.trim()} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu mẫu'}</button></div>
        </div>}
      </section>
      <section className="af-card pt-side">
        <header><Icon name="tag" size={16} /><b>Biến dùng được</b><span className="small muted">· bấm để chép</span></header>
        <ul className="pt-vl">{varList(proc).map((v) => <li key={v.k}><button onClick={() => copy(v.k)}><code>{'{' + v.k + '}'}</code><span>{v.t}</span></button></li>)}</ul>
      </section>
    </div>
    {pv && <Preview html={pv.html} landscape={pv.landscape} title={pv.t.name + ' (thử)'} onXlsx={() => downloadWb(pv.wb, safe(pv.t.name) + '_thu.xlsx')} onTpl={() => dl(pv.t)} onClose={() => setPv(null)} />}
  </div>;
}
