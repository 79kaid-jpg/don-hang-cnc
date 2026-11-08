import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { COMPANY, PROC_NAME, STATUS, type Proc } from '../lib/proc';
import { f0Perm, type FProc, allFields, companiesOf, defaultPerm, loadFields, slug, stepsOf, tablesOf, useFields, PERM_NAME, TYPE_NAME, type Area, type FDef, type FType, type Perm } from '../lib/fields';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

const PROCS: FProc[] = ['F0', 'QT0', 'QT1', 'QT2', 'QT3'];
const PERMS: Perm[] = ['hide', 'view', 'edit', 'required'];
const TYPES: Record<Area, FType[]> = { header: ['text', 'number', 'date', 'select', 'textarea'], col: ['text', 'number'], file: ['file'] };
const Chev = ({ up = false, size = 14 }: { up?: boolean; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>;
const stepName = (s: string) => (s === 'tiep_nhan' ? 'Tiếp nhận' : STATUS[s] ?? s);

/** Quản trị → Trường dữ liệu: thêm / sửa trường của QT0–QT3, quyền Ẩn · Xem · Sửa · Bắt buộc theo bước × công ty */
export function FieldsAdmin({ canEdit }: { canEdit: boolean }) {
  useFields();
  const [proc, setProc] = useState<FProc>('QT1');
  const [open, setOpen] = useState<string>('');
  const all = allFields(proc);
  const sections: { area: Area; tbl: string; title: string; sub: string }[] = proc === 'F0'
    ? [{ area: 'header', tbl: '', title: 'Thông tin đơn hàng', sub: 'Ô nhập khi tạo đơn và ở tab F0. Khách hàng luôn bắt buộc. Ô có sẵn chỉ đổi được tên, lựa chọn và Ẩn / Bắt buộc' }] : [
    { area: 'header', tbl: '', title: 'Thông tin phiếu', sub: 'Các ô nhập ở đầu phiếu' },
    ...tablesOf(proc as Proc).map((t) => ({ area: 'col' as Area, tbl: t.key, title: 'Cột · ' + t.title, sub: 'Cột của bảng. Cột tự tính chỉ đổi được tên và quyền' })),
    { area: 'file', tbl: '', title: 'Tệp đính kèm', sub: 'Mỗi dòng là một loại tệp; Bắt buộc = phải tải ít nhất 1 tệp trước khi ký' }];
  const add = async (area: Area, tbl: string) => {
    const label = area === 'file' ? 'Loại tệp mới' : area === 'col' ? 'Cột mới' : 'Trường mới';
    const keys = new Set(all.filter((f) => f.area === area && f.tbl === tbl).map((f) => f.key));
    let key = slug(label); let i = 2; while (keys.has(key)) key = slug(label) + '_' + i++;
    const ord = Math.max(-1, ...all.filter((f) => f.area === area && f.tbl === tbl).map((f) => f.ord)) + 1;
    const { data, error } = await sb.from('proc_fields').insert({ proc, area, tbl, key, label, type: area === 'file' ? 'file' : 'text', ord, sys: false }).select('id').single();
    if (error) return toast(errText(error));
    await loadFields(); setOpen((data as { id: string }).id);
  };
  const move = async (f: FDef, dir: -1 | 1) => {
    const list = all.filter((x) => x.area === f.area && x.tbl === f.tbl); const i = list.findIndex((x) => x.id === f.id); const o = list[i + dir]; if (!o) return;
    await sb.from('proc_fields').update({ ord: o.ord }).eq('id', f.id!); await sb.from('proc_fields').update({ ord: f.ord === o.ord ? f.ord + dir : f.ord }).eq('id', o.id!);
    loadFields();
  };
  return (
    <div className="fa">
      <div className="fa-top">
        <div className="ap-seg fa-procs" role="radiogroup" aria-label="Quy trình">
          {PROCS.map((p) => <button key={p} role="radio" aria-checked={proc === p} className={proc === p ? 'on' : ''} onClick={() => { setProc(p); setOpen(''); }}>{p}</button>)}</div>
        <span className="small muted">{proc === 'F0' ? 'Tiếp nhận · thông tin đơn hàng' : PROC_NAME[proc]}</span>
      </div>
      {proc === 'F0' ? <p className="small muted fa-note">Ô thêm mới hiện ở màn hình Tạo đơn và tab F0, dùng được trong Mẫu in với tên biến trong ngoặc nhọn. <b>Bắt buộc</b>: không lưu được đơn khi còn trống.</p> : <p className="small muted fa-note">Quyền mặc định: <b>Sửa</b> ở bước người làm nhập liệu ({proc === 'QT0' ? 'Tiếp nhận, Bóc tách, Tạo DS tấm' : 'Lập'}), <b>Xem</b> ở các bước còn lại. <b>Bắt buộc</b> được kiểm tra khi bấm Ký: thiếu thì không ký được. Thay đổi áp dụng ngay cho cả phiếu đang mở; ẩn trường không xoá dữ liệu đã nhập.</p>}
      {sections.map((s) => { const list = all.filter((f) => f.area === s.area && f.tbl === s.tbl);
        return <section key={s.area + s.tbl} className="fa-sec">
          <header><div><b>{s.title}</b><div className="small muted">{s.sub}</div></div>
            {canEdit && <button className="btn sm" onClick={() => add(s.area, s.tbl)}><Icon name="plus" size={15} />Thêm</button>}</header>
          <ul className="fa-list">{list.map((f, i) => <Row key={f.id ?? f.key} f={f} proc={proc} first={i === 0} last={i === list.length - 1} canEdit={canEdit}
            open={open === f.id} onOpen={() => setOpen(open === f.id ? '' : f.id ?? '')} onMove={(d) => move(f, d)} />)}</ul>
        </section>; })}
    </div>);
}

function Row({ f, proc, open, onOpen, onMove, first, last, canEdit }: { f: FDef; proc: FProc; open: boolean; onOpen: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean; canEdit: boolean }) {
  const [x, setX] = useState(f); const [busy, setBusy] = useState(false);
  useEffect(() => setX(f), [f]);
  const dirty = JSON.stringify(x) !== JSON.stringify(f);
  const f0 = proc === 'F0'; const cos = f0 ? [] : companiesOf(proc as Proc); const steps = f0 ? [] : stepsOf(proc as Proc);
  const reqs = cos.flatMap((c) => steps.filter((s) => x.perms?.[c]?.[s] === 'required').map((s) => (proc === 'QT0' ? '' : c + ' ') + stepName(s)));
  const hides = cos.flatMap((c) => steps.filter((s) => x.perms?.[c]?.[s] === 'hide')).length;
  const setP = (c: string, s: string, v: string) => { const p = { ...(x.perms ?? {}) }; const row = { ...(p[c] ?? {}) };
    if (v) row[s] = v as Perm; else delete row[s]; p[c] = row; setX({ ...x, perms: p }); };
  const setAll = (s: string, v: string) => { const p = { ...(x.perms ?? {}) }; for (const c of cos) { const row = { ...(p[c] ?? {}) }; if (v) row[s] = v as Perm; else delete row[s]; p[c] = row; } setX({ ...x, perms: p }); };
  const save = async () => { setBusy(true);
    const { error } = await sb.from('proc_fields').update({ label: x.label.trim() || f.label, type: x.type, options: x.options, help: x.help, decimals: x.decimals, active: x.active, perms: x.perms, updated_at: new Date().toISOString() }).eq('id', f.id!);
    setBusy(false); if (error) return toast(errText(error)); toast('Đã lưu ' + x.label); loadFields(); };
  const del = async () => { if (!(await confirmDialog(`Ẩn hẳn “${f.label}”? Dữ liệu đã nhập vẫn được giữ, có thể bật lại.`, 'Ẩn trường'))) return;
    await sb.from('proc_fields').update({ active: false }).eq('id', f.id!); loadFields(); };
  return (
    <li className={'fa-row' + (open ? ' open' : '') + (f.active ? '' : ' off')}>
      <div className="fa-line">
        {canEdit && <span className="fa-mv"><button className="link-btn" disabled={first} onClick={() => onMove(-1)} aria-label="Lên"><Chev up /></button>
          <button className="link-btn" disabled={last} onClick={() => onMove(1)} aria-label="Xuống"><Chev /></button></span>}
        <button className="fa-main" onClick={onOpen} aria-expanded={open}>
          <span className="fa-lb">{f.label}{!f.active && <span className="fa-tag">đã ẩn</span>}{f.sys && <span className="fa-tag">{proc === 'F0' ? 'có sẵn' : 'tự tính'}</span>}</span>
          <span className="small muted">{f0 && f0Perm(x) !== 'edit' && <span className="fa-req">{PERM_NAME[f0Perm(x)]} · </span>}{TYPE_NAME[f.type]}{f.area !== 'file' ? ' · {' + (f.area === 'col' ? f.tbl + '.' : '') + f.key + '}' : ''}
            {reqs.length > 0 && <span className="fa-req"> · Bắt buộc: {reqs.slice(0, 3).join(', ')}{reqs.length > 3 ? '…' : ''}</span>}{hides > 0 && ' · ẩn ' + hides + ' ô'}</span>
        </button>
        <span className="fa-chev"><Chev size={16} /></span>
      </div>
      {open && <div className="fa-ed">
        <div className="grid2">
          <label className="f">Tên hiển thị<input value={x.label} disabled={!canEdit} onChange={(e) => setX({ ...x, label: e.target.value })} /></label>
          {f.area !== 'file' && <label className="f">Kiểu dữ liệu<select value={x.type} disabled={!canEdit || f.sys} onChange={(e) => setX({ ...x, type: e.target.value as FType })}>
            {(f.type === 'person' ? ['person' as FType] : TYPES[f.area]).map((t) => <option key={t} value={t}>{TYPE_NAME[t]}</option>)}</select></label>}
          {x.type === 'select' && <label className="f f-wide">Các lựa chọn (mỗi dòng một giá trị)<textarea rows={3} disabled={!canEdit} value={x.options.join('\n')} onChange={(e) => setX({ ...x, options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></label>}
          {f.area === 'col' && x.type === 'number' && <label className="f">Số chữ số thập phân<input inputMode="numeric" disabled={!canEdit} value={x.decimals ?? ''} onChange={(e) => setX({ ...x, decimals: e.target.value === '' ? null : Math.max(0, Math.min(4, +e.target.value || 0)) })} /></label>}
          {f0 && <label className="f">Quyền<select value={f0Perm(x)} disabled={!canEdit || (f.key === 'project')} onChange={(e) => setX({ ...x, perms: e.target.value === 'edit' ? {} : { '*': { '*': e.target.value as Perm } } })}>
            <option value="edit">Nhập được (không bắt buộc)</option><option value="required">Bắt buộc</option><option value="hide">Ẩn</option></select></label>}
          {f.area === 'header' && <label className="f f-wide">Hướng dẫn nhập (hiện dưới ô)<input disabled={!canEdit} value={x.help} onChange={(e) => setX({ ...x, help: e.target.value })} placeholder="VD: Ghi theo số trên hợp đồng" /></label>}
        </div>
        {!f0 && <><div className="fa-pm-h"><b>Quyền theo bước × công ty</b><span className="small muted">Để trống = mặc định</span></div>
        <div className="tbl-wrap"><table className="fa-pm">
          <thead><tr><th />{steps.map((s) => <th key={s}>{stepName(s)}
            {canEdit && cos.length > 1 && <select className="fa-all" aria-label={'Đặt cả cột ' + stepName(s)} value="" onChange={(e) => setAll(s, e.target.value === '_' ? '' : e.target.value)}>
              <option value="">cả cột…</option><option value="_">Mặc định</option>{PERMS.map((p) => <option key={p} value={p}>{PERM_NAME[p]}</option>)}</select>}</th>)}</tr></thead>
          <tbody>{cos.map((c) => <tr key={c}><th>{proc === 'QT0' ? 'Phương Nam' : COMPANY[c]}</th>
            {steps.map((s) => { const v = x.perms?.[c]?.[s] ?? ''; const eff = (v || defaultPerm(proc, s)) as Perm;
              return <td key={s}><select className={'pm-' + eff + (v ? '' : ' def')} disabled={!canEdit || (f.sys && v !== 'hide' && false)} value={v} onChange={(e) => setP(c, s, e.target.value)} aria-label={c + ' ' + stepName(s)}>
                <option value="">{PERM_NAME[defaultPerm(proc, s)]} (mặc định)</option>
                {PERMS.filter((p) => !(f.sys && (p === 'edit' || p === 'required'))).map((p) => <option key={p} value={p}>{PERM_NAME[p]}</option>)}</select></td>; })}</tr>)}</tbody>
        </table></div></>}
        {canEdit && <div className="row fa-act">
          {!f.sys && (f.active ? <button className="btn sm" onClick={del}><Icon name="eyeoff" size={15} />Ẩn trường</button>
            : <button className="btn sm" onClick={() => setX({ ...x, active: true })}><Icon name="eye" size={15} />Bật lại</button>)}
          <span style={{ flex: 1 }} />
          {dirty && <button className="btn sm" onClick={() => setX(f)}>Huỷ</button>}
          <button className="btn sm primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Đang lưu…' : dirty ? 'Lưu' : 'Đã lưu'}</button></div>}
      </div>}
    </li>);
}
