import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { reloadMaterials, useMaterials } from '../lib/materials';
import type { Material } from '../lib/proc';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

/** Quản trị → Vật liệu: tỷ trọng dùng để tính khối lượng (kg = m² × dày × tỷ trọng) */
export function MaterialsAdmin({ canEdit }: { canEdit: boolean }) {
  const list = useMaterials();
  const add = async () => { const { error } = await sb.from('materials').insert({ name: 'Vật liệu mới ' + ((list?.length ?? 0) + 1), density: 7.85, keywords: [], ord: list?.length ?? 0 });
    if (error) return toast(errText(error)); reloadMaterials(); };
  return <div className="mat">
    <p className="small muted" style={{ margin: 0 }}>Khối lượng (kg) = m² × độ dày (mm) × <b>tỷ trọng</b> (g/cm³). Hệ thống nhận vật liệu theo thứ tự: ô chọn đúng tên vật liệu → <b>từ khoá</b> trong tên hàng / mác thép (khớp dài nhất) → <b>vật liệu mặc định</b> (ô kg có dấu ⚠). Tỷ trọng được chốt vào phiếu mỗi lần lưu, nên phiếu đã duyệt không đổi khi sửa ở đây.</p>
    {list === null ? <p className="muted">Đang tải…</p> : <ul className="mat-list">{list.map((m) => <Row key={m.id} m={m} canEdit={canEdit} />)}</ul>}
    {canEdit && <button className="btn sm" onClick={add}><Icon name="plus" size={15} />Thêm vật liệu</button>}
  </div>;
}
function Row({ m, canEdit }: { m: Material; canEdit: boolean }) {
  const [x, setX] = useState({ name: m.name, density: String(m.density), kw: m.keywords.join(', ') }); const [busy, setBusy] = useState(false);
  useEffect(() => setX({ name: m.name, density: String(m.density), kw: m.keywords.join(', ') }), [m]);
  const d = Number(x.density.replace(',', '.')); const bad = !(d > 0 && d < 30) || !x.name.trim();
  const dirty = x.name !== m.name || x.density !== String(m.density) || x.kw !== m.keywords.join(', ');
  const save = async (patch?: Partial<Material>) => { setBusy(true);
    const { error } = await sb.from('materials').update(patch ?? { name: x.name.trim(), density: d, keywords: x.kw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean), updated_at: new Date().toISOString() }).eq('id', m.id);
    setBusy(false); if (error) return toast(errText(error)); toast('Đã lưu ' + (patch ? m.name : x.name)); reloadMaterials(); };
  const mkDefault = async () => { await sb.from('materials').update({ is_default: false }).eq('is_default', true); await save({ is_default: true, active: true }); };
  const del = async () => { if (!(await confirmDialog(`Xoá vật liệu “${m.name}”? Phiếu đã lưu vẫn giữ tỷ trọng cũ.`, 'Xoá', true))) return;
    const { error } = await sb.from('materials').delete().eq('id', m.id); if (error) return toast(errText(error)); reloadMaterials(); };
  return <li className={'mat-it card' + (m.active ? '' : ' off')}>
    <label className="f"><span>Tên vật liệu</span><input value={x.name} disabled={!canEdit} onChange={(e) => setX({ ...x, name: e.target.value })} /></label>
    <label className="f mat-d"><span>Tỷ trọng (g/cm³)</span><input inputMode="decimal" value={x.density} disabled={!canEdit} aria-invalid={!(d > 0 && d < 30)} onChange={(e) => setX({ ...x, density: e.target.value })} /></label>
    <label className="f mat-k"><span>Từ khoá nhận diện <small className="muted">cách nhau bởi dấu phẩy</small></span><input value={x.kw} disabled={!canEdit} placeholder="vd: inox, sus, 304" onChange={(e) => setX({ ...x, kw: e.target.value })} /></label>
    <div className="mat-a">
      {m.is_default ? <span className="fa-tag">mặc định</span> : canEdit && m.active && <button className="btn xs" disabled={busy} onClick={mkDefault} title="Dùng khi không nhận ra vật liệu">Đặt mặc định</button>}
      {canEdit && <label className="nba-sw"><input type="checkbox" checked={m.active} disabled={busy || m.is_default} onChange={(e) => save({ active: e.target.checked })} /><span>Dùng</span></label>}
      {canEdit && dirty && <button className="btn xs primary" disabled={busy || bad} onClick={() => save()}>Lưu</button>}
      {canEdit && !m.is_default && <button className="btn xs icon-only danger-soft" aria-label={'Xoá ' + m.name} onClick={del}><Icon name="trash" size={13} /></button>}
    </div>
  </li>;
}
