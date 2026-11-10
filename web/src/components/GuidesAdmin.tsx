import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { loadGuides, useGuides, type Guide } from '../lib/guides';
import { GuideBox } from './GuideBox';
import { Icon } from './Icon';
import { toast, confirmDialog } from './ui';

const GROUPS: [string, string][] = [['QT0', 'QT0 · Bóc tách'], ['QT1', 'QT1 · XNĐH'], ['QT2', 'QT2 · Lệnh GC'], ['QT3', 'QT3 · Giao hàng'], ['sim', 'Tình huống chung']];
const CO: Record<string, string> = { PN: 'Phương Nam', IPC: 'IPC', HW: 'Hanwa' };

/** Quản trị → Hướng dẫn bước: nơi DUY NHẤT sửa hướng dẫn; áp dụng cho Mô phỏng, phiếu thật và trang Hướng dẫn */
export function GuidesAdmin({ canEdit }: { canEdit: boolean }) {
  const all = useGuides(); const [sp, setSp] = useSearchParams();
  const k = sp.get('k') ?? all[0]?.key ?? ''; const g = all.find((x) => x.key === k);
  const pick = (key: string) => { const n = new URLSearchParams(sp); n.set('k', key); setSp(n, { replace: true }); };
  const [f, setF] = useState({ purpose: '', todo: '', notes: '', links: '' }); const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { if (g) setF({ purpose: g.purpose, todo: g.todo, notes: g.notes, links: g.links }); }, [g?.key, g?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sb.from('profiles').select('id, full_name').then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])))); }, []);
  const dirty = !!g && (f.purpose !== g.purpose || f.todo !== g.todo || f.notes !== g.notes || f.links !== g.links);
  const grouped = useMemo(() => GROUPS.map(([p, t]) => [t, all.filter((x) => x.key.startsWith(p + '.'))] as [string, Guide[]]), [all]);
  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => { setBusy(true); const { error } = await fn(); setBusy(false);
    if (error) { toast(errText(error as never)); return false; } toast(ok); await loadGuides(true); return true; };
  const save = () => run(() => sb.rpc('guide_save', { p_key: k, p_purpose: f.purpose, p_todo: f.todo, p_notes: f.notes, p_links: f.links }), 'Đã lưu – áp dụng cho toàn bộ app');
  const m = k.match(/^(QT[1-3])\.\*\.(\w+)$/); const own = k.match(/^(QT[1-3])\.(PN|IPC|HW)\.(\w+)$/);
  const addOwn = async (co: string) => { const nk = `${m![1]}.${co}.${m![2]}`; if (all.some((x) => x.key === nk)) return pick(nk);
    if (await run(() => sb.rpc('guide_save', { p_key: nk, p_purpose: g!.purpose, p_todo: g!.todo, p_notes: g!.notes, p_links: g!.links }), 'Đã tạo hướng dẫn riêng cho ' + CO[co])) pick(nk); };
  const dt = (s?: string) => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="gda">
      <aside className="gda-nav">
        <select className="gda-pick" value={k} onChange={(e) => pick(e.target.value)} aria-label="Chọn bước">
          {grouped.map(([t, xs]) => <optgroup key={t} label={t}>{xs.map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}</optgroup>)}</select>
        {grouped.map(([t, xs]) => <div key={t} className="gda-grp"><div className="gda-gt">{t}</div>
          {xs.map((x) => <button key={x.key} className={x.key === k ? 'on' : ''} onClick={() => pick(x.key)}>{x.title}{x.key.match(/\.(PN|IPC|HW)\./) && <span className="chip">riêng</span>}</button>)}</div>)}
      </aside>
      {g ? <section className="gda-ed">
        <header><div><h3>{g.title}</h3><div className="small muted">Sửa lần cuối {dt(g.updated_at)}{g.updated_by ? ' · ' + (names[g.updated_by] ?? '') : ''}</div></div>
          <div className="row" style={{ gap: 6 }}>
            {g.prev && canEdit && <button className="btn sm" disabled={busy} onClick={async () => { if (await confirmDialog('Khôi phục bản trước của hướng dẫn này?', 'Khôi phục')) run(() => sb.rpc('guide_restore', { p_key: k }), 'Đã khôi phục bản trước'); }}><Icon name="refresh" size={14} />Bản trước</button>}
            {own && canEdit && <button className="btn sm danger-soft" disabled={busy} onClick={async () => { if (await confirmDialog('Bỏ hướng dẫn riêng, dùng lại hướng dẫn chung?', 'Bỏ bản riêng')) { if (await run(() => sb.rpc('guide_unset', { p_key: k }), 'Đã dùng lại hướng dẫn chung')) pick(`${own[1]}.*.${own[3]}`); } }}>Dùng bản chung</button>}
            {canEdit && <button className="btn sm primary" disabled={!dirty || busy} onClick={save}><Icon name="check" size={14} />{dirty ? 'Lưu' : 'Đã lưu'}</button>}
          </div></header>
        {m && <div className="msg info"><Icon name="users" size={16} /><span>Hướng dẫn chung cho cả 3 công ty. Dùng <code>{'{cty}'}</code> để chèn tên công ty, <code>{'{phieu}'}</code> tên phiếu.
          {canEdit && <> Cần khác nhau theo công ty: {(['PN', 'IPC', 'HW'] as const).map((c) => <button key={c} className="btn xs" style={{ marginLeft: 6 }} onClick={() => addOwn(c)}>+ Riêng {CO[c]}</button>)}</>}</span></div>}
        <label className="f">Mục đích <span className="muted small">– bước này để làm gì (1–2 câu)</span>
          <textarea rows={3} disabled={!canEdit} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></label>
        <label className="f">Việc cần làm <span className="muted small">– mỗi dòng một việc</span>
          <textarea rows={5} disabled={!canEdit} value={f.todo} onChange={(e) => setF({ ...f, todo: e.target.value })} /></label>
        <label className="f">Lưu ý / lỗi hay gặp
          <textarea rows={3} disabled={!canEdit} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <label className="f">Tài liệu kèm theo <span className="muted small">– mỗi dòng: Tên | https://link</span>
          <textarea rows={2} disabled={!canEdit} value={f.links} placeholder="Video hướng dẫn | https://..." onChange={(e) => setF({ ...f, links: e.target.value })} /></label>
        <div className="gda-pv"><div className="gda-gt">Xem trước – người dùng sẽ thấy</div><GuideBox g={{ ...g, ...f }} vars={{ cty: 'Phương Nam CNC', cty_sau: 'IPC', phieu: 'Xác nhận đơn hàng', cap: 'Giám đốc' }} /></div>
      </section> : <div className="muted">Đang tải…</div>}
    </div>);
}
