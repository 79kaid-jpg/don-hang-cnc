import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { useCompanies, reloadCompanies, type Company } from '../lib/coorders';
import { toast } from './ui';

const TOK: [string, string][] = [['{YYYYMMDD}', 'Ngày tạo'], ['{YYMMDD}', 'Ngày (ngắn)'], ['{BAN}', 'Công ty bán'], ['{MUA}', 'Bên mua'], ['{DA}', 'Mã dự án'], ['{STT:2}', 'STT trong ngày']];

/** Quản trị → Đánh số: mẫu mã đơn theo công ty, bật/tắt cho sửa, xem trước */
export function NumberingAdmin({ canEdit }: { canEdit: boolean }) {
  const cos = useCompanies();
  return <div className="nba">
    <p className="muted small" style={{ margin: 0 }}>Mã đơn được cấp tự động khi công ty lập XNĐH (QT1). STT đếm theo số đơn trong ngày của từng công ty. Khi Hanwa bán, {'{MUA}'} là mã khách cuối.</p>
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
  </section>;
}
