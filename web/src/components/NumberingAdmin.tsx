import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { useCompanies, reloadCompanies, type Company } from '../lib/coorders';
import { toast } from './ui';

const TOK: [string, string][] = [['{DA}', 'Mã dự án'], ['{B1}', 'Chữ đầu công ty (P/I/H)'], ['{YYMM}', 'Năm-tháng'], ['{YYYYMMDD}', 'Ngày tạo'], ['{YYMMDD}', 'Ngày (ngắn)'], ['{BAN}', 'Công ty bán'], ['{MUA}', 'Bên mua'], ['{STT:2}', 'Số thứ tự']];

/** Quản trị → Đánh số: mẫu mã đơn theo công ty, bật/tắt cho sửa, xem trước */
export function NumberingAdmin({ canEdit }: { canEdit: boolean }) {
  const cos = useCompanies();
  return <div className="nba">
    <p className="muted small" style={{ margin: 0 }}>Mã đơn được cấp tự động khi công ty lập XNĐH (QT1). STT đếm riêng theo công ty + dự án (nếu mẫu có {'{DA}'}), về lại 01 khi sang ngày (mẫu có ngày) hoặc sang tháng (mẫu có {'{YYMM}'}). VD {'{DA}{B1}{YYMM}-{STT:2}'} → SLUCOLP2611-01. Khi Hanwa bán, {'{MUA}'} là mã khách cuối.</p>
    {cos === null ? <p className="muted">Đang tải…</p> : cos.map((c) => <Row key={c.code} c={c} canEdit={canEdit} />)}
  </div>;
}
function Row({ c, canEdit }: { c: Company; canEdit: boolean }) {
  const [rule, setRule] = useState(c.rule); const [pv, setPv] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => sb.rpc('co_preview', { p_rule: rule, p_co: c.code }).then(({ data }) => setPv(data ?? '')), 250); return () => clearTimeout(t); }, [rule, c.code]);
  const save = async (patch: Partial<Company>) => { setBusy(true); const { error } = await sb.from('companies').update(patch).eq('code', c.code); setBusy(false);
    if (error) return toast(errText(error)); await reloadCompanies(); toast('Đã lưu ' + c.code); };
  const ins = (t: string) => setRule((r) => r + t);
  return <section className="card nba-it">
    <div className="nba-h"><b className="pj-code">{c.code}</b><b>{c.name}</b><span className="muted small">bán cho {c.buyer ?? 'khách cuối'}</span>
      <label className="nba-sw"><input type="checkbox" disabled={!canEdit || busy} checked={c.allow_edit} onChange={(e) => save({ allow_edit: e.target.checked })} /><span>Cho sửa mã</span></label></div>
    <label className="f"><span>Mẫu mã đơn</span><input value={rule} disabled={!canEdit} onChange={(e) => setRule(e.target.value)} spellCheck={false} /></label>
    {canEdit && <div className="nba-tok">{TOK.map(([t, l]) => <button key={t} type="button" className="chip" onClick={() => ins(t)} title={l}>{t}</button>)}</div>}
    <div className="nba-pv"><span className="muted small">Xem trước</span><b>{pv || '…'}</b></div>
    {canEdit && rule !== c.rule && <div className="row"><button className="btn primary sm" disabled={busy || !rule.trim()} onClick={() => save({ rule: rule.trim() })}>Lưu mẫu</button><button className="btn sm" onClick={() => setRule(c.rule)}>Huỷ</button></div>}
    <CtSeq c={c} canEdit={canEdit} />
  </section>;
}
/** Số chứng từ (Số CT) của XNĐH: cấp theo dãy khi phiếu được duyệt */
function CtSeq({ c, canEdit }: { c: Company; canEdit: boolean }) {
  const [rule, setRule] = useState(c.ct_rule ?? '{BAN}-{YYYY}/{SEQ:4}'); const [last, setLast] = useState(String(c.ct_last ?? 0)); const [pv, setPv] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => sb.rpc('ct_preview', { p_co: c.code }).then(({ data }) => setPv(data ?? ''));
  useEffect(() => { load(); }, [c.ct_rule, c.ct_last, c.ct_yearly]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (patch: Partial<Company>) => { setBusy(true); const { error } = await sb.from('companies').update(patch).eq('code', c.code); setBusy(false);
    if (error) return toast(errText(error)); await reloadCompanies(); toast('Đã lưu Số CT ' + c.code); };
  const dirty = rule !== (c.ct_rule ?? '') || last !== String(c.ct_last ?? 0);
  return <div className="nba-ct">
    <b className="small">Số CT (XNĐH) · cấp khi phiếu được duyệt</b>
    <div className="nba-ctg">
      <label className="f"><span>Mẫu Số CT</span><input value={rule} disabled={!canEdit} onChange={(e) => setRule(e.target.value)} spellCheck={false} /></label>
      <label className="f"><span>Số cuối đã cấp</span><input type="number" min={0} inputMode="numeric" value={last} disabled={!canEdit} onChange={(e) => setLast(e.target.value)} /></label>
      <label className="nba-sw"><input type="checkbox" disabled={!canEdit || busy} checked={!!c.ct_yearly} onChange={(e) => save({ ct_yearly: e.target.checked })} /><span>Đếm lại từ 1 mỗi năm</span></label>
    </div>
    {canEdit && <div className="nba-tok">{[['{YYYY}', 'Năm'], ['{YY}', 'Năm (2 số)'], ['{BAN}', 'Mã công ty'], ['{SEQ:4}', 'Số thứ tự 4 chữ số']].map(([t, l]) => <button key={t} type="button" className="chip" onClick={() => setRule((r) => r + t)} title={l}>{t}</button>)}</div>}
    <div className="nba-pv"><span className="muted small">Số tiếp theo</span><b>{pv || '…'}</b></div>
    {canEdit && dirty && <div className="row"><button className="btn primary sm" disabled={busy || !rule.includes('{SEQ') || !(Number(last) >= 0)} onClick={() => save({ ct_rule: rule.trim(), ct_last: Math.floor(Number(last)), ct_year: new Date().getFullYear() })}>Lưu Số CT</button><button className="btn sm" onClick={() => { setRule(c.ct_rule ?? ''); setLast(String(c.ct_last ?? 0)); }}>Huỷ</button></div>}
  </div>;
}
