import { useEffect, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { COMPANY, PROC_NAME, ROLE_NAME, type Proc } from '../lib/proc';
import { Icon } from './Icon';
import { QtTag } from './QtTag';
import { toast } from './ui';

/** Quản trị → Luồng duyệt: mỗi quy trình × công ty là một chuỗi khối có cấu trúc.
 *  Bước chính (Lập → Kiểm tra → Duyệt) lấy người từ "Phụ trách quy trình"; có thể đặt hạn từng bước.
 *  Sau bước Duyệt, thêm "cấp duyệt thêm" có điều kiện (ví dụ Tổng thanh toán > 500 triệu → Giám đốc duyệt). Kèm ủy quyền khi vắng. */
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null; sla_h: number };
type LV = { id?: string; proc: string; company: string; ord: number; name: string; cond_field: string; cond_op: string; cond_value: number | null; user_id: string | null; group_id: string | null; sla_h: number; active: boolean };
type DG = { id?: string; user_id: string; to_user: string; from_date: string; to_date: string; note?: string | null };
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const ROLES: Record<Proc, string[]> = { QT0: ['admin', 'ky_thuat', 'kiem_tra', 'duyet'], QT1: ['lap', 'kiem_tra', 'duyet'], QT2: ['lap', 'kiem_tra', 'duyet'], QT3: ['lap', 'kiem_tra', 'duyet'] };

export function ApprovalFlows({ canEdit }: { canEdit: boolean }) {
  const [proc, setProc] = useState<Proc>('QT1'); const [co, setCo] = useState('PN');
  const [cp, setCp] = useState<CP[]>([]); const [lv, setLv] = useState<LV[]>([]); const [dg, setDg] = useState<DG[]>([]);
  const [people, setPeople] = useState<Profile[]>([]); const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [edit, setEdit] = useState<LV | null>(null); const [nd, setNd] = useState<DG | null>(null);
  const load = () => {
    sb.from('chain_people').select('*').then(({ data }) => setCp((data as CP[]) ?? []));
    sb.from('approval_levels').select('*').order('ord').then(({ data }) => setLv((data as LV[]) ?? []));
    sb.from('delegations').select('*').order('from_date', { ascending: false }).then(({ data }) => setDg((data as DG[]) ?? []));
  };
  useEffect(() => { load(); sb.from('profiles').select('*').eq('active', true).order('full_name').then(({ data }) => setPeople((data as Profile[]) ?? []));
    sb.from('work_groups').select('id, name').eq('active', true).then(({ data }) => setGroups((data as never[]) ?? [])); }, []);
  const cos = proc === 'QT0' ? ['PN'] : ['PN', 'IPC', 'HW']; const company = cos.includes(co) ? co : 'PN';
  const who = (u: string | null, g: string | null) => (u ? people.find((p) => p.id === u)?.full_name : g ? groups.find((x) => x.id === g)?.name : null) ?? 'Chưa giao';
  const mine = lv.filter((l) => l.proc === proc && l.company === company);
  const setSla = async (role: string, v: number) => {
    const { error } = await sb.from('chain_people').update({ sla_h: v }).eq('proc', proc).eq('company', company).eq('role', role);
    if (error) toast(error.message); else { setCp(cp.map((c) => (c.proc === proc && c.company === company && c.role === role ? { ...c, sla_h: v } : c))); }
  };
  const saveLv = async () => {
    if (!edit) return; if (!edit.user_id && !edit.group_id) { toast('Chọn người hoặc nhóm duyệt'); return; }
    const { id, ...row } = edit; const q = id ? sb.from('approval_levels').update(row).eq('id', id) : sb.from('approval_levels').insert(row);
    const { error } = await q; if (error) toast(error.message); else { toast('Đã lưu cấp duyệt'); setEdit(null); load(); }
  };
  const offLv = async (l: LV) => { const { error } = await sb.from('approval_levels').update({ active: !l.active }).eq('id', l.id!); if (error) toast(error.message); else load(); };
  const saveDg = async () => { if (!nd?.user_id || !nd.to_user || !nd.to_date) { toast('Chọn người, người nhận và ngày kết thúc'); return; }
    const { error } = await sb.from('delegations').insert(nd); if (error) toast(error.message); else { toast('Đã thêm ủy quyền'); setNd(null); load(); } };
  const endDg = async (d: DG) => { const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); const { error } = await sb.from('delegations').update({ to_date: y < d.from_date ? d.from_date : y }).eq('id', d.id!); if (error) toast(error.message); else load(); };
  const pick = (u: string | null, g: string | null, on: (u: string | null, g: string | null) => void) =>
    <select value={u ? 'u:' + u : g ? 'g:' + g : ''} disabled={!canEdit} onChange={(e) => { const v = e.target.value; on(v.startsWith('u:') ? v.slice(2) : null, v.startsWith('g:') ? v.slice(2) : null); }}>
      <option value="">– Chọn –</option>
      <optgroup label="Người">{people.map((p) => <option key={p.id} value={'u:' + p.id}>{p.full_name}</option>)}</optgroup>
      <optgroup label="Nhóm">{groups.map((x) => <option key={x.id} value={'g:' + x.id}>{x.name}</option>)}</optgroup></select>;
  const today = new Date().toISOString().slice(0, 10);

  return <div className="af">
    <div className="af-pick">
      <div className="seg" role="tablist">{PROCS.map((p) => <button key={p} role="tab" aria-pressed={proc === p} onClick={() => setProc(p)}>{p}</button>)}</div>
      {cos.length > 1 && <div className="seg">{cos.map((c) => <button key={c} aria-pressed={company === c} onClick={() => setCo(c)}>{c === 'HW' ? 'Hanwha' : c}</button>)}</div>}
    </div>
    <section className="af-card">
      <header><QtTag qt={proc} /><b>{PROC_NAME[proc]}</b><span className="small muted">· {COMPANY[company as 'PN']}</span></header>
      <ol className="af-flow">
        {ROLES[proc].map((r, i) => { const c = cp.find((x) => x.proc === proc && x.company === company && x.role === r);
          return <li key={r} className="af-step">
            <span className="af-n">{i + 1}</span>
            <div className="af-b"><b>{ROLE_NAME[r]}</b><span className="small">{who(c?.user_id ?? null, c?.group_id ?? null)}</span></div>
            <label className="af-sla" title="Hạn xử lý bước này"><Icon name="clock" size={13} />
              <input type="number" min={1} value={c?.sla_h ?? 48} disabled={!canEdit || !c} onChange={(e) => setSla(r, Math.max(1, +e.target.value || 1))} />h</label>
          </li>; })}
        {mine.map((l) => <li key={l.id} className={'af-step extra' + (l.active ? '' : ' off')}>
          <span className="af-n cond"><Icon name="shield" size={13} /></span>
          <div className="af-b"><b>{l.name}</b>
            <span className="small">Duyệt theo nội dung phiếu & ghi chú · {who(l.user_id, l.group_id)}</span></div>
          <span className="af-sla ro"><Icon name="clock" size={13} />{l.sla_h}h</span>
          {canEdit && <span className="af-act"><button className="btn sm" onClick={() => setEdit(l)}>Sửa</button><button className="btn sm" onClick={() => offLv(l)}>{l.active ? 'Tắt' : 'Bật'}</button></span>}
        </li>)}
        <li className="af-end"><Icon name="check" size={14} />{proc === 'QT0' ? 'Hoàn tất bóc tách' : company === 'HW' ? 'Chờ khách ký tay' : 'Chuyển ' + (company === 'PN' ? 'IPC' : 'Hanwha')}</li>
      </ol>
      {canEdit && !edit && <button className="btn sm af-add" onClick={() => setEdit({ proc, company, ord: mine.length + 1, name: 'Giám đốc duyệt', cond_field: 'none', cond_op: '>', cond_value: null, user_id: null, group_id: null, sla_h: 24, active: true })}>
        <Icon name="plus" size={15} />Thêm cấp duyệt sau bước Duyệt</button>}
      {edit && <div className="af-edit">
        <label className="f"><span>Tên cấp duyệt</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <div className="af-row">
          <label className="f"><span>Người / nhóm duyệt</span>{pick(edit.user_id, edit.group_id, (u, g) => setEdit({ ...edit, user_id: u, group_id: g }))}</label>
          <label className="f" style={{ maxWidth: 120 }}><span>Hạn (giờ)</span><input type="number" min={1} value={edit.sla_h} onChange={(e) => setEdit({ ...edit, sla_h: +e.target.value || 24 })} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Khi người ở bước Duyệt ký, nếu điều kiện đúng hồ sơ sẽ chờ thêm cấp này trước khi {company === 'HW' ? 'chờ ký tay' : 'chuyển sang công ty kế tiếp'}. {proc !== 'QT1' && 'Điều kiện theo tiền chỉ có ở QT1.'}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setEdit(null)}>Huỷ</button><button className="btn primary" onClick={saveLv}>Lưu cấp duyệt</button></div>
      </div>}
      <p className="small muted" style={{ margin: 0 }}>Người ở 3 bước chính đổi tại tab <b>Phụ trách quy trình</b>. Hạn từng bước dùng để cảnh báo “sắp / quá hạn”.</p>
    </section>

    <section className="af-card">
      <header><Icon name="users" size={16} /><b>Ủy quyền khi vắng</b></header>
      <p className="small muted" style={{ margin: 0 }}>Trong thời gian ủy quyền, người nhận thấy và ký được mọi việc của người ủy quyền (cả các cấp duyệt thêm). Nhật ký ghi tên người ký thật.</p>
      {dg.length ? <ul className="af-dg">{dg.map((d) => { const on = d.from_date <= today && today <= d.to_date; return <li key={d.id} className={on ? 'on' : ''}>
        <span><b>{who(d.user_id, null)}</b> → <b>{who(d.to_user, null)}</b></span>
        <span className="small muted">{d.from_date.split('-').reverse().join('/')} – {d.to_date.split('-').reverse().join('/')}{d.note ? ' · ' + d.note : ''}</span>
        {on ? <span className="chip done">Đang hiệu lực</span> : <span className="chip idle">{d.to_date < today ? 'Đã hết' : 'Sắp tới'}</span>}
        {canEdit && on && <button className="btn sm" onClick={() => endDg(d)}>Kết thúc</button>}</li>; })}</ul> : <p className="small muted" style={{ margin: 0 }}>Chưa có ủy quyền nào.</p>}
      {canEdit && (nd ? <div className="af-edit">
        <div className="af-row">
          <label className="f"><span>Người vắng</span>{pick(nd.user_id || null, null, (u) => setNd({ ...nd, user_id: u ?? '' }))}</label>
          <label className="f"><span>Ủy quyền cho</span>{pick(nd.to_user || null, null, (u) => setNd({ ...nd, to_user: u ?? '' }))}</label></div>
        <div className="af-row">
          <label className="f"><span>Từ ngày</span><input type="date" value={nd.from_date} onChange={(e) => setNd({ ...nd, from_date: e.target.value })} /></label>
          <label className="f"><span>Đến ngày</span><input type="date" value={nd.to_date} onChange={(e) => setNd({ ...nd, to_date: e.target.value })} /></label></div>
        <label className="f"><span>Ghi chú</span><input value={nd.note ?? ''} onChange={(e) => setNd({ ...nd, note: e.target.value })} placeholder="Ví dụ: nghỉ phép" /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setNd(null)}>Huỷ</button><button className="btn primary" onClick={saveDg}>Lưu ủy quyền</button></div>
      </div> : <button className="btn sm af-add" onClick={() => setNd({ user_id: '', to_user: '', from_date: today, to_date: today })}><Icon name="plus" size={15} />Thêm ủy quyền</button>)}
    </section>
  </div>;
}
