import { useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { ROLES } from '../lib/format';
import { COMPANY, PROC_NAME, STATUS, type Proc } from '../lib/proc';
import { f0Perm, type FProc, allFields, companiesOf, defaultPerm, loadFields, slug, stepsOf, tablesOf, useFields, PERM_NAME, TYPE_NAME, type Area, type FDef, type FType, type Perm, REF_VARS, LOOKUPS, colsOf } from '../lib/fields';
import { checkFormula, evalFormula, FUNCS } from '../lib/formula';
import type { Proc as PProc } from '../lib/proc';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

const PROCS: FProc[] = ['F0', 'QT0', 'QT1', 'QT2', 'QT3'];
const PERMS: Perm[] = ['hide', 'view', 'edit', 'required'];
const TYPES: Record<Area, FType[]> = { header: ['text', 'number', 'date', 'select', 'textarea'], col: ['text', 'number', 'int', 'date', 'datetime', 'select', 'multi', 'bool', 'ref', 'lookup', 'formula', 'subtable'], file: ['file'], table: ['text'] };
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
    ...tablesOf(proc as Proc).flatMap((t) => [{ area: 'col' as Area, tbl: t.key, title: 'Cột · ' + t.title, sub: 'Cột của bảng. Cột tự tính chỉ đổi được tên và quyền' },
      ...all.filter((f) => f.area === 'col' && f.tbl === t.key && f.type === 'subtable' && f.active).map((f) => ({ area: 'col' as Area, tbl: t.key + '.' + f.key, title: '↳ Cột · Bảng con “' + f.label + '” (trong ' + t.title + ')', sub: 'Mỗi dòng của bảng cha có một bảng con với các cột này. Công thức ở bảng cha cộng được cột số của bảng con: {' + f.key + '.ten_cot}' }))]),
    { area: 'table', tbl: '', title: 'Quyền cả bảng', sub: 'Đứng trên quyền từng cột. Ẩn = ẩn cả bảng · Xem = cả bảng chỉ xem (kể cả cột đang để Sửa) · Sửa = theo quyền từng cột · Bắt buộc = như Sửa và bảng phải có ít nhất 1 dòng mới ký được' },
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
  // Kéo-thả sắp xếp: tay nắm ⋮⋮, chỉ trong cùng nhóm (thông tin / một bảng)
  const [drag, setDrag] = useState<{ sec: string; from: number; to: number } | null>(null);
  const reorder = async (list: FDef[], from: number, to: number) => {
    if (from === to) return; const a = [...list]; const [m] = a.splice(from, 1); a.splice(to > from ? to - 1 : to, 0, m);
    const ch = a.map((f, i) => ({ f, i })).filter(({ f, i }) => f.ord !== i);
    const rs = await Promise.all(ch.map(({ f, i }) => sb.from('proc_fields').update({ ord: i }).eq('id', f.id!)));
    const e = rs.find((r) => r.error)?.error; if (e) toast(errText(e)); else toast('Đã lưu thứ tự'); loadFields(); };
  const startDrag = (ev: React.PointerEvent, sec: string, list: FDef[], from: number) => {
    if (!canEdit || open) return; ev.preventDefault(); const ul = (ev.currentTarget as HTMLElement).closest('ul')!; const touch = ev.pointerType !== 'mouse';
    let on = !touch; let st = { sec, from, to: from }; const t0 = touch ? window.setTimeout(() => { on = true; setDrag(st); navigator.vibrate?.(10); }, 200) : 0;
    if (on) setDrag(st);
    const mv = (e: PointerEvent) => { if (!on) return; e.preventDefault(); const lis = [...ul.children] as HTMLElement[]; let to = lis.length;
      for (let i = 0; i < lis.length; i++) { const r = lis[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
      if (e.clientY < 80) scrollBy(0, -12); else if (e.clientY > innerHeight - 80) scrollBy(0, 12);
      if (to !== st.to) { st = { ...st, to }; setDrag(st); } };
    const up = () => { clearTimeout(t0); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      setDrag(null); if (on) reorder(list, st.from, st.to); };
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up); };
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
            {canEdit && s.area !== 'table' && <button className="btn sm" onClick={() => add(s.area, s.tbl)}><Icon name="plus" size={15} />Thêm</button>}</header>
          <ul className={'fa-list' + (drag?.sec === s.area + s.tbl ? ' dragging' : '')}>{list.map((f, i) => { const sk = s.area + s.tbl; const dg = drag?.sec === sk ? drag : null;
            return <Row key={f.id ?? f.key} f={f} proc={proc} first={i === 0} last={i === list.length - 1} canEdit={canEdit}
            open={open === f.id} onOpen={() => setOpen(open === f.id ? '' : f.id ?? '')} onMove={(d) => move(f, d)}
            grip={list.length > 1 && !open ? (e) => startDrag(e, sk, list, i) : undefined} dragCls={dg ? (dg.from === i ? ' drag-src' : '') + (dg.to === i && dg.to !== dg.from && dg.to !== dg.from + 1 ? ' drop-before' : '') + (dg.to === list.length && i === list.length - 1 && dg.from !== i ? ' drop-after' : '') : ''} />; })}</ul>
        </section>; })}
    </div>);
}

function Row({ f, proc, open, onOpen, onMove, first, last, canEdit, grip, dragCls = '' }: { f: FDef; proc: FProc; open: boolean; onOpen: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean; canEdit: boolean; grip?: (e: React.PointerEvent) => void; dragCls?: string }) {
  const [x, setX] = useState(f); const [busy, setBusy] = useState(false);
  useEffect(() => setX(f), [f]);
  const dirty = JSON.stringify(x) !== JSON.stringify(f);
  const f0 = proc === 'F0'; const cos = f0 ? [] : companiesOf(proc as Proc); const steps = f0 ? [] : stepsOf(proc as Proc);
  const reqs = cos.flatMap((c) => steps.filter((s) => x.perms?.[c]?.[s] === 'required').map((s) => (proc === 'QT0' ? '' : c + ' ') + stepName(s)));
  const hides = cos.flatMap((c) => steps.filter((s) => x.perms?.[c]?.[s] === 'hide')).length;
  const setP = (c: string, s: string, v: string) => { const p = { ...(x.perms ?? {}) }; const row = { ...(p[c] ?? {}) };
    if (v) row[s] = v as Perm; else delete row[s]; p[c] = row; setX({ ...x, perms: p }); };
  const setAll = (s: string, v: string) => { const p = { ...(x.perms ?? {}) }; for (const c of cos) { const row = { ...(p[c] ?? {}) }; if (v) row[s] = v as Perm; else delete row[s]; p[c] = row; } setX({ ...x, perms: p }); };
  const save = async () => {
    if (x.type === 'formula' && proc !== 'F0') { const e = checkFormula(x.options[0] ?? '', [...colsOf(proc as PProc, x.tbl).filter((c) => c.k !== x.key).flatMap((c) => [c.k, ...(c.sub ?? []).map((s) => c.k + '.' + s.k)]), 'ty_trong']); if (e) return toast('Công thức chưa đúng: ' + e); }
    if ((x.type === 'ref' || x.type === 'lookup') && !x.options[0]) return toast('Chưa chọn nguồn cho ' + x.label);
    setBusy(true);
    const { error } = await sb.from('proc_fields').update({ label: x.label.trim() || f.label, import_names: (x.import_names ?? []).map((v) => v.trim()).filter(Boolean), type: x.type, options: x.options, help: x.help, decimals: x.decimals, active: x.active, perms: x.perms, restricted: !!x.restricted, view_roles: x.view_roles ?? [], view_users: x.view_users ?? [], view_approver: !!x.view_approver, updated_at: new Date().toISOString() }).eq('id', f.id!);
    setBusy(false); if (error) return toast(errText(error)); toast('Đã lưu ' + x.label); loadFields(); };
  const del = async () => { if (!(await confirmDialog(`Ẩn hẳn “${f.label}”? Dữ liệu đã nhập vẫn được giữ, có thể bật lại.`, 'Ẩn trường'))) return;
    await sb.from('proc_fields').update({ active: false }).eq('id', f.id!); loadFields(); };
  return (
    <li className={'fa-row' + (open ? ' open' : '') + (f.active ? '' : ' off') + dragCls}>
      <div className="fa-line">
        {canEdit && grip && <span className="fa-grip" onPointerDown={grip} title="Kéo để sắp xếp" aria-hidden="true"><svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg></span>}
        {canEdit && <span className="fa-mv"><button className="link-btn" disabled={first} onClick={() => onMove(-1)} aria-label="Lên"><Chev up /></button>
          <button className="link-btn" disabled={last} onClick={() => onMove(1)} aria-label="Xuống"><Chev /></button></span>}
        <button className="fa-main" onClick={onOpen} aria-expanded={open}>
          <span className="fa-lb">{f.label}{f.restricted && <span className="fa-tag lock" title="Trường nhạy cảm – chỉ người được cấp quyền mới thấy">🔒 hạn chế</span>}{!f.active && <span className="fa-tag">đã ẩn</span>}{f.sys && f.area !== 'table' && <span className="fa-tag">{proc === 'F0' ? 'có sẵn' : 'tự tính'}</span>}</span>
          <span className="small muted">{f.area === 'table' ? 'Bảng ' + f.key + ' · ' : ''}{f0 && f0Perm(x) !== 'edit' && <span className="fa-req">{PERM_NAME[f0Perm(x)]} · </span>}{TYPE_NAME[f.type]}{f.area !== 'file' ? ' · {' + (f.area === 'col' ? f.tbl + '.' : '') + f.key + '}' : ''}
            {reqs.length > 0 && <span className="fa-req"> · Bắt buộc: {reqs.slice(0, 3).join(', ')}{reqs.length > 3 ? '…' : ''}</span>}{hides > 0 && ' · ẩn ' + hides + ' ô'}</span>
        </button>
        <span className="fa-chev"><Chev size={16} /></span>
      </div>
      {open && <div className="fa-ed">
        <div className="grid2">
          <label className="f">Tên hiển thị<input value={x.label} disabled={!canEdit} onChange={(e) => setX({ ...x, label: e.target.value })} /></label>
          {f.area !== 'file' && f.area !== 'table' && <label className="f">Kiểu dữ liệu<select value={x.type} disabled={!canEdit || f.sys} onChange={(e) => setX({ ...x, type: e.target.value as FType })}>
            {(f.type === 'person' ? ['person' as FType] : TYPES[f.area].filter((t) => !(t === 'subtable' && f.tbl.includes('.')))).map((t) => <option key={t} value={t}>{TYPE_NAME[t]}</option>)}</select></label>}
          {f.area === 'col' && !f.tbl.includes('.') && x.type !== 'formula' && x.type !== 'ref' && x.type !== 'subtable' && <label className="f">Tên cột trong file nhập <small className="muted">(file phần mềm SX… cách nhau dấu phẩy)</small><input disabled={!canEdit} value={(x.import_names ?? []).join(',')} placeholder={'vd: ' + x.label} onChange={(e) => setX({ ...x, import_names: e.target.value.split(',') })} /></label>}
          {f.area === 'col' && x.type === 'formula' && <FormulaEd x={x} setX={setX} canEdit={canEdit} proc={proc} />}
          {x.type === 'lookup' && <label className="f">Danh mục<select disabled={!canEdit} value={x.options[0] ?? ''} onChange={(e) => setX({ ...x, options: [e.target.value] })}><option value="">– chọn –</option>{LOOKUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><small className="muted">Người nhập chọn từ danh sách này thay vì gõ tay.</small></label>}
          {x.type === 'ref' && <label className="f">Lấy giá trị<select disabled={!canEdit} value={x.options[0] ?? ''} onChange={(e) => setX({ ...x, options: [e.target.value] })}><option value="">– chọn –</option>{REF_VARS.map(([k, l]) => <option key={k} value={k}>{l} {'{' + k + '}'}</option>)}</select><small className="muted">Mọi dòng hiện cùng giá trị, chỉ xem. Giá trị được chốt khi phiếu được duyệt.</small></label>}
          {(x.type === 'select' || x.type === 'multi') && <label className="f f-wide">Các lựa chọn (mỗi dòng một giá trị)<textarea rows={3} disabled={!canEdit} value={x.options.join('\n')} onChange={(e) => setX({ ...x, options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></label>}
          {f.area === 'col' && (x.type === 'number' || x.type === 'formula') && <label className="f">Số chữ số thập phân<input inputMode="numeric" disabled={!canEdit} value={x.decimals ?? ''} onChange={(e) => setX({ ...x, decimals: e.target.value === '' ? null : Math.max(0, Math.min(4, +e.target.value || 0)) })} /></label>}
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
            {steps.map((s) => { const v = x.perms?.[c]?.[s] ?? ''; const eff = (v || (f.area === 'table' ? 'view' : defaultPerm(proc, s))) as Perm;
              return <td key={s}><select className={'pm-' + eff + (v ? '' : ' def')} disabled={!canEdit || (f.sys && v !== 'hide' && false)} value={v} onChange={(e) => setP(c, s, e.target.value)} aria-label={c + ' ' + stepName(s)}>
                <option value="">{f.area === 'table' ? 'Không bắt buộc' : PERM_NAME[defaultPerm(proc, s)] + ' (mặc định)'}</option>
                {PERMS.filter((p) => (f.area === 'table' ? p === 'required' : !(f.sys && (p === 'edit' || p === 'required')))).map((p) => <option key={p} value={p}>{PERM_NAME[p]}</option>)}</select></td>; })}</tr>)}</tbody>
        </table></div></>}
        {!f0 && f.area !== 'table' && <ViewAccess x={x} setX={setX} canEdit={canEdit} />}
        {canEdit && <div className="row fa-act">
          {!f.sys && (f.active ? <button className="btn sm" onClick={del}><Icon name="eyeoff" size={15} />Ẩn trường</button>
            : <button className="btn sm" onClick={() => setX({ ...x, active: true })}><Icon name="eye" size={15} />Bật lại</button>)}
          <span style={{ flex: 1 }} />
          {dirty && <button className="btn sm" onClick={() => setX(f)}>Huỷ</button>}
          <button className="btn sm primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Đang lưu…' : dirty ? 'Lưu' : 'Đã lưu'}</button></div>}
      </div>}
    </li>);
}

/** Ai được xem trường này (thực thi ở máy chủ). Không bật = ai xem được hồ sơ thì thấy. */
let peopleCache: Profile[] | null = null;
function ViewAccess({ x, setX, canEdit }: { x: FDef; setX: (f: FDef) => void; canEdit: boolean }) {
  const [people, setPeople] = useState<Profile[]>(peopleCache ?? []);
  useEffect(() => { if (!peopleCache) sb.from('profiles').select('*').eq('active', true).order('full_name').then(({ data }) => { peopleCache = (data as Profile[]) ?? []; setPeople(peopleCache); }); }, []);
  const roles = x.view_roles ?? []; const users = x.view_users ?? [];
  const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((a) => a !== v) : [...arr, v]);
  return (
    <div className="fa-va">
      <label className="switch-row"><span><b>Trường nhạy cảm (hạn chế người xem)</b><br /><span className="small muted">Bật để chỉ những người dưới đây thấy và nhập được. Người khác không thấy cột / ô này, kể cả trên bản in và PDF. Admin IT luôn thấy.</span></span>
        <input type="checkbox" className="switch" disabled={!canEdit} checked={!!x.restricted} onChange={(e) => setX({ ...x, restricted: e.target.checked })} /></label>
      {x.restricted && <>
        <label className="role-row"><input type="checkbox" disabled={!canEdit} checked={!!x.view_approver} onChange={(e) => setX({ ...x, view_approver: e.target.checked })} />
          <span><b>Người duyệt của công ty đó</b><br /><span className="small muted">Người phụ trách bước Duyệt / Duyệt thêm của quy trình này</span></span></label>
        <div className="f"><span>Vai trò được xem <span className="small muted">(trong cùng công ty)</span></span>
          <div className="chips">{Object.entries(ROLES).filter(([k]) => k !== 'admin_it').map(([k, t]) => (
            <button key={k} type="button" disabled={!canEdit} className={'pill-toggle' + (roles.includes(k) ? ' on' : '')} aria-pressed={roles.includes(k)} onClick={() => setX({ ...x, view_roles: tog(roles, k) })}>{t}</button>))}</div></div>
        <div className="f"><span>Người cụ thể được xem</span>
          <div className="chips">{users.map((id) => { const p = people.find((q) => q.id === id); return (
            <span key={id} className="pill-toggle on">{p?.full_name ?? id.slice(0, 8)} · {p?.unit}{canEdit && <button type="button" className="link-btn" aria-label="Bỏ" onClick={() => setX({ ...x, view_users: users.filter((u) => u !== id) })}>✕</button>}</span>); })}
            {canEdit && <select value="" aria-label="Thêm người" onChange={(e) => e.target.value && setX({ ...x, view_users: [...users, e.target.value] })}>
              <option value="">+ Thêm người…</option>{people.filter((p) => !users.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.unit}</option>)}</select>}</div>
          <span className="small muted">Người cụ thể chỉ thấy ở hồ sơ của công ty họ (công ty khác vẫn bị chặn).</span></div>
      </>}
    </div>);
}

/** Soạn công thức: chèn tên cột, kiểm tra ngay, xem trước với số mẫu */
function FormulaEd({ x, setX, canEdit, proc }: { x: FDef; setX: (v: FDef) => void; canEdit: boolean; proc: FProc }) {
  const fx = x.options[0] ?? ''; const sum = x.options[1] === 'sum';
  const cols = proc === 'F0' ? [] : colsOf(proc as PProc, x.tbl).filter((c) => c.k !== x.key);
  const sample: Record<string, number> = {}; const SM: Record<string, number> = { rong: 1200, dai: 2400, day: 3, so_tam: 2, m2: 5.76, kg: 46.7, don_gia: 100000, tt: 576000 }; cols.forEach((c) => { sample[c.k] = c.n ? SM[c.k] ?? 10 : 0; });
  const subKeys = cols.filter((c) => c.ty === 'sub').flatMap((c) => (c.sub ?? []).filter((s) => s.n).map((s) => c.k + '.' + s.k));
  const err = checkFormula(fx, [...cols.map((c) => c.k), 'ty_trong', ...subKeys]); sample.ty_trong = 2.75;
  const pv = err ? null : evalFormula(fx, (k) => sample[k] ?? null);
  const set = (v: string, s2 = sum) => setX({ ...x, options: [v, s2 ? 'sum' : ''] });
  return <div className="f f-wide fx-ed">
    <span>Công thức <small className="muted">dùng tên cột trong ngoặc nhọn, + − * / ^ ( ) và hàm {Object.keys(FUNCS).join(', ')}</small></span>
    <input className="fx-in" spellCheck={false} disabled={!canEdit} value={fx} placeholder="{rong}*{dai}/1000000*{so_tam}" aria-invalid={!!fx && !!err} onChange={(e) => set(e.target.value)} />
    {canEdit && <div className="fx-chips">{cols.filter((c) => c.n).map((c) => <button key={c.k} type="button" className="chip" title={c.t} onClick={() => set(fx + '{' + c.k + '}')}>{c.t}</button>)}
      {subKeys.map((k) => <button key={k} type="button" className="chip" title="Tổng cột này của bảng con trong dòng" onClick={() => set(fx + '{' + k + '}')}>Σ {k}</button>)}
      <button type="button" className="chip" title="Tỷ trọng vật liệu của dòng (Quản trị → Vật liệu)" onClick={() => set(fx + '{ty_trong}')}>Tỷ trọng</button>
      {['+', '−', '*', '/', '(', ')'].map((o) => <button key={o} type="button" className="chip fx-op" onClick={() => set(fx + (o === '−' ? '-' : o))}>{o}</button>)}</div>}
    <div className={'fx-pv' + (fx && err ? ' bad' : '')}>{!fx ? 'Nhập công thức để xem trước' : err ? '⚠ ' + err : <>Thử với số mẫu → <b>{pv == null ? '(trống)' : pv.toLocaleString('vi-VN', { maximumFractionDigits: x.decimals ?? 2 })}</b> <small className="muted">({cols.filter((c) => c.n && fx.includes('{' + c.k + '}')).map((c) => c.t + '=' + sample[c.k]).join(', ')})</small></>}</div>
    <label className="nba-sw"><input type="checkbox" disabled={!canEdit} checked={sum} onChange={(e) => set(fx, e.target.checked)} /><span>Cộng tổng ở cuối bảng</span></label>
  </div>;
}
