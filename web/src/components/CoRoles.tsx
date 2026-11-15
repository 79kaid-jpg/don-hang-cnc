import { ROLES } from '../lib/format';

/** Quyền theo công ty: admin IT (chung) + công ty × vai trò. Máy tính: bảng tick; điện thoại: thẻ từng công ty với nhãn vai trò. */
export type Co = 'PN' | 'IPC' | 'HW';
export type Access = { admin: boolean; cos: Partial<Record<Co, string[]>> };
export const COS: [Co, string][] = [['PN', 'Phương Nam CNC'], ['IPC', 'IPC'], ['HW', 'Hanwa']];
export const CO_SHORT: Record<Co, string> = { PN: 'PNC', IPC: 'IPC', HW: 'HAN' };
const CO_ROLES = Object.entries(ROLES).filter(([k]) => k !== 'admin_it');
/** Tên ngắn trên nhãn danh sách */
export const ROLE_SHORT: Record<string, string> = { giam_doc: 'GĐ', kinh_doanh: 'KD', ky_thuat: 'KT bóc tách', kiem_tra_f1: 'KT F1', admin_cnc: 'Admin', ke_hoach: 'KH', mua_hang: 'Mua', kho_qc: 'Kho/QC', ipc: 'IPC', duyet: 'Duyệt', thiet_ke_qt: 'TK QT', xem: 'Xem' };

export function CoRoles({ v, on, hints, lockAdmin }: { v: Access; on: (x: Access) => void; hints?: Record<string, string>; lockAdmin?: boolean }) {
  const has = (c: Co) => v.cos[c] !== undefined;
  const togCo = (c: Co) => { const n = { ...v.cos }; if (has(c)) delete n[c]; else n[c] = []; on({ ...v, cos: n }); };
  const togR = (c: Co, r: string) => { const cur = v.cos[c] ?? []; on({ ...v, cos: { ...v.cos, [c]: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] } }); };
  return <div className="cr">
    <label className="cr-adm"><input type="checkbox" checked={v.admin} disabled={lockAdmin} onChange={(e) => on({ ...v, admin: e.target.checked })} />
      <span><b>IT quản trị</b> <span className="small muted">– toàn quyền ở mọi công ty</span></span></label>
    {/* Máy tính / tablet: bảng */}
    <div className="cr-tbl-wrap"><table className="cr-tbl">
      <thead><tr><th scope="col">Công ty</th>{CO_ROLES.map(([k, t]) => <th key={k} scope="col" title={hints?.[k]}><span>{t}</span></th>)}</tr></thead>
      <tbody>{COS.map(([c, n]) => <tr key={c} className={has(c) ? 'on' : ''}>
        <th scope="row"><label className="cr-co"><input type="checkbox" checked={has(c)} onChange={() => togCo(c)} /><span className={'adm2-co co-' + c}>{CO_SHORT[c]}</span><span className="cr-cn">{n}</span></label></th>
        {CO_ROLES.map(([k, t]) => <td key={k}><input type="checkbox" aria-label={n + ' · ' + t} disabled={!has(c)} checked={(v.cos[c] ?? []).includes(k)} onChange={() => togR(c, k)} /></td>)}</tr>)}</tbody>
    </table></div>
    {/* Điện thoại: thẻ */}
    <div className="cr-cards">{COS.map(([c, n]) => <div key={c} className={'cr-card' + (has(c) ? ' on' : '')}>
      <label className="cr-co"><input type="checkbox" checked={has(c)} onChange={() => togCo(c)} /><span className={'adm2-co co-' + c}>{CO_SHORT[c]}</span><b>{n}</b></label>
      {has(c) && <div className="cr-chips">{CO_ROLES.map(([k, t]) => { const on2 = (v.cos[c] ?? []).includes(k); return <button key={k} type="button" aria-pressed={on2} className={on2 ? 'on' : ''} onClick={() => togR(c, k)}>{on2 ? '✓ ' : ''}{t}</button>; })}</div>}
    </div>)}</div>
    <p className="small muted" style={{ margin: 0 }}>Tick công ty người này làm việc, rồi chọn vai trò ở từng công ty. Quyền dùng app theo <b>công ty đang làm</b> (nút “Đang làm” trên menu). Việc Lập / Kiểm tra / Duyệt từng bước gán ở <b>Phụ trách quy trình</b>.</p>
  </div>;
}
/** Nhãn gọn cho danh sách: PNC · KD, Admin */
export function CoTags({ a }: { a: Access }) {
  return <>{a.admin && <span className="adm2-tag adm">IT quản trị</span>}
    {COS.filter(([c]) => a.cos[c] !== undefined).map(([c]) => <span key={c} className="adm2-tag cr-tag"><span className={'adm2-co co-' + c}>{CO_SHORT[c]}</span>{(a.cos[c] ?? []).map((r) => ROLE_SHORT[r] ?? r).join(', ') || <i className="muted">chưa vai trò</i>}</span>)}</>;
}
