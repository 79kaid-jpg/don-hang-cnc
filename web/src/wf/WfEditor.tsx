import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { Msg, Skeleton, confirmDialog, toast } from '../components/ui';
import { KIND, ROLE_LABEL, VSTATUS, emptyDef, items, loadDirectory, newStep, uid, validate, who,
  type Assignee, type CheckItem, type ApprLevel, RULE, ON_REJECT, type Op, type Route, OPS, END, condFields, type Def, type Field, type Column, type Perm, PERM, FTYPE, type Directory, type Process, type Step, type StepKind, type Version } from './model';

import { Canvas, LANE_COLORS } from './Canvas';

export default function WfEditor() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const [proc, setProc] = useState<Process | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [def, setDef] = useState<Def>(emptyDef());
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'so_do' | 'ds'>(() => { try { return (localStorage.getItem('wf-view') as 'so_do' | 'ds') || (innerWidth >= 900 ? 'so_do' : 'ds'); } catch { return 'ds'; } });
  const pickView = (v: 'so_do' | 'ds') => { setView(v); try { localStorage.setItem('wf-view', v); } catch { /* */ } };
  const [dir, setDir] = useState<Directory | null>(null);
  const [err, setErr] = useState('');
  const [showErr, setShowErr] = useState(false);

  const load = async () => {
    const [p, v] = await Promise.all([sb.from('wf_processes').select('*').eq('id', id).single(),
      sb.from('wf_versions').select('*').eq('process_id', id).order('version', { ascending: false })]);
    if (p.error) return setErr(errText(p.error));
    setProc(p.data as Process); setName((p.data as Process).name);
    const vs = (v.data ?? []) as Version[]; setVersions(vs);
    setDef(structuredClone(vs[0]?.def ?? emptyDef())); setDirty(false);
  };
  useEffect(() => { load(); loadDirectory().then(setDir); }, [id]);

  const latest = versions[0];
  const live = versions.find((v) => v.status === 'phat_hanh');
  const ro = !can('admin_it') || !!proc?.is_template;
  const errors = useMemo(() => validate(def), [def]);
  const errOf = (sid: string) => errors.filter((e) => e.step === sid);
  const errIds = new Set(errors.map((e) => e.step).filter(Boolean) as string[]);
  const moveTo = (sid: string, lane: string, idx: number) => upd((d) => { const i = d.steps.findIndex((x) => x.id === sid); const [st] = d.steps.splice(i, 1); st.lane = lane; d.steps.splice(idx, 0, st); });
  const laneIdx = (l: string) => Math.max(0, def.lanes.findIndex((x) => x.id === l));

  const upd = (f: (d: Def) => void) => { if (ro) return; const d = structuredClone(def); f(d); setDef(d); setDirty(true); };
  const setStep = (sid: string, patch: Partial<Step>) => upd((d) => { const s = d.steps.find((x) => x.id === sid)!; Object.assign(s, patch); });
  const insertAt = (i: number) => { const s = newStep(def.steps[i - 1]?.lane ?? def.lanes[0]?.id ?? ''); upd((d) => d.steps.splice(i, 0, s)); setOpen(s.id); };
  const move = (i: number, dlt: number) => upd((d) => { const j = i + dlt; if (j < 0 || j >= d.steps.length) return; [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]]; });
  const dup = (i: number) => upd((d) => d.steps.splice(i + 1, 0, { ...structuredClone(d.steps[i]), id: uid(), name: d.steps[i].name + ' (bản sao)' }));
  const del = async (i: number) => { if (await confirmDialog(`Xoá bước "${def.steps[i].name || 'chưa đặt tên'}"?`, 'Xoá')) upd((d) => d.steps.splice(i, 1)); };

  const save = async (quiet = false) => {
    if (!proc) return null;
    const { data, error } = await sb.rpc('wf_save_draft', { p_process: proc.id, p_def: def, p_name: name, p_desc: null });
    if (error) { setErr(errText(error)); return null; }
    setErr(''); if (!quiet) toast('Đã lưu bản nháp'); await load(); return data as string;
  };
  const publish = async () => {
    if (errors.length) { setShowErr(true); return; }
    if (!(await confirmDialog(`Phát hành ${name}? Lượt chạy mới dùng bản này; lượt đang chạy giữ phiên bản cũ.`, 'Phát hành', true))) return;
    const vid = dirty || latest?.status !== 'nhap' ? await save(true) : latest.id;
    if (!vid) return;
    const { error } = await sb.rpc('wf_publish', { p_version: vid, p_note: '' });
    if (error) return setErr(errText(error));
    toast('Đã phát hành'); load();
  };
  const testRun = async () => {
    if (errors.length) { setShowErr(true); return; }
    const vid = dirty || !latest ? await save(true) : latest.id;
    if (!vid) return;
    const { data, error } = await sb.rpc('wf_start', { p_version: vid, p_title: 'Chạy thử ' + new Date().toLocaleString('vi-VN'), p_test: true });
    if (error) return setErr(errText(error));
    nav('/quy-trinh-moi/chay/' + data);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!ro && dirty) save(); } };
    const b = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener('keydown', h); addEventListener('beforeunload', b);
    return () => { removeEventListener('keydown', h); removeEventListener('beforeunload', b); };
  });

  if (!proc) return err ? <Msg err={err} /> : <Skeleton />;
  return (
    <div className="wf" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-head">
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Link to="/quy-trinh-moi" className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="back" size={14} />Trình tạo quy trình</Link>
          {ro ? <h1>{name}</h1> : <input className="wf-title" value={name} aria-label="Tên quy trình" onChange={(e) => { setName(e.target.value); setDirty(true); }} />}
          <div className="row small muted">
            {proc.is_template && <span className="chip idle">Mẫu · chỉ đọc</span>}
            {latest && <span>Bản {latest.version}: {VSTATUS[latest.status]}</span>}
            {live && live.id !== latest?.id && <span>· Đang chạy bản {live.version}</span>}
            {dirty && <span className="chip wait">Chưa lưu</span>}
          </div>
        </div>
        {!ro && <div className="row">
          <button className="btn sm" disabled={!dirty} onClick={() => save()}><Icon name="check" size={16} />Lưu nháp</button>
          <button className="btn sm ghost" onClick={testRun}><Icon name="eye" size={16} />Chạy thử</button>
          <button className="btn sm primary" onClick={publish}><Icon name="upload" size={16} />Phát hành</button>
        </div>}
      </div>
      <Msg err={err} />
      {errors.length > 0 && !ro && (
        <div className={'wf-check' + (showErr ? ' open' : '')} role="status">
          <button className="wf-check-h" onClick={() => setShowErr(!showErr)}><Icon name="alert" size={16} />Còn {errors.length} lỗi cần sửa trước khi phát hành<Icon name="back" size={14} /></button>
          {showErr && <ul>{errors.map((e, i) => <li key={i}>{e.step ? <button className="linkish" onClick={() => setOpen(e.step!)}>{e.msg}</button> : e.msg}</li>)}</ul>}
        </div>)}

      {/* Làn = công ty / phòng ban */}
      <section className="card" aria-label="Làn">
        <div className="row" style={{ justifyContent: 'space-between' }}><b>Làn (công ty / phòng ban)</b>
          {!ro && <button className="btn sm" onClick={() => upd((d) => d.lanes.push({ id: uid('l'), name: 'Làn ' + (d.lanes.length + 1) }))}><Icon name="plus" size={16} />Thêm làn</button>}</div>
        <div className="row" style={{ marginTop: 8 }}>
          {def.lanes.map((l, i) => (
            <span key={l.id} className="wf-lane" style={{ '--lc': LANE_COLORS[i % LANE_COLORS.length] } as React.CSSProperties}>
              {ro ? l.name : <input value={l.name} aria-label="Tên làn" size={Math.max(6, l.name.length)} onChange={(e) => upd((d) => { d.lanes[i].name = e.target.value; })} />}
              {!ro && def.lanes.length > 1 && <button aria-label={'Xoá làn ' + l.name} onClick={() => upd((d) => { d.lanes.splice(i, 1); d.steps.forEach((s) => { if (s.lane === l.id) s.lane = d.lanes[0].id; }); })}><Icon name="x" size={14} /></button>}
            </span>))}
        </div>
      </section>

      <FieldsEditor fields={def.fields ?? []} ro={ro} onChange={(f) => upd((d) => { d.fields = f; })} />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-seg" role="tablist" aria-label="Kiểu xem">
          <button role="tab" aria-selected={view === 'so_do'} className={view === 'so_do' ? 'on p-edit' : ''} onClick={() => pickView('so_do')}>Sơ đồ swimlane</button>
          <button role="tab" aria-selected={view === 'ds'} className={view === 'ds' ? 'on p-edit' : ''} onClick={() => pickView('ds')}>Danh sách bước</button></div>
        {!ro && view === 'so_do' && <button className="btn sm primary" onClick={() => insertAt(def.steps.length)}><Icon name="plus" size={16} />Thêm bước</button>}
      </div>

      {view === 'so_do' && <div className={'wf-design' + (open ? ' has-panel' : '')}>
        <Canvas def={def} dir={dir} sel={open} errIds={errIds} ro={ro} onSelect={setOpen} onMove={moveTo}
          onAddLane={() => upd((d) => { d.lanes.push({ id: uid('l'), name: 'Làn ' + (d.lanes.length + 1) }); })}
          onRenameLane={(k, nm) => upd((d) => { if (d.lanes[k]) d.lanes[k].name = nm; })} />
        {open && (() => { const i = def.steps.findIndex((x) => x.id === open); const st = def.steps[i]; if (!st) return null; return (
          <aside className="card wf-panel" aria-label="Cấu hình bước">
            <div className="row" style={{ justifyContent: 'space-between' }}><b>Bước {i + 1}</b><button className="btn sm icon-btn" aria-label="Đóng" onClick={() => setOpen(null)}><Icon name="x" size={16} /></button></div>
            {errOf(st.id).map((e, k) => <div key={k} className="msg err small" role="alert"><Icon name="alert" size={14} />{e.msg}</div>)}
            <StepForm s={st} i={i} n={def.steps.length} def={def} dir={dir} ro={ro} set={(p) => setStep(st.id, p)}
              onMove={(d) => move(i, d)} onDup={() => dup(i)} onDel={async () => { await del(i); }} />
          </aside>); })()}
      </div>}

      {view === 'ds' && <>
      {/* Các bước – dạng timeline dọc, dùng tốt trên cả laptop và điện thoại */}
      <section aria-label="Các bước" className="wf-flow">
        <div className="wf-node start">Bắt đầu</div>
        {!ro && <Insert onClick={() => insertAt(0)} />}
        {def.steps.map((s, i) => {
          const c = LANE_COLORS[laneIdx(s.lane) % LANE_COLORS.length]; const isOpen = open === s.id; const se = errOf(s.id);
          return (
            <div key={s.id} style={{ display: 'contents' }}>
              <article className={'wf-step' + (isOpen ? ' open' : '') + (se.length ? ' has-err' : '')} style={{ '--lc': c } as React.CSSProperties}>
                <button className="wf-step-h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                  <span className="wf-no">{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <b>{s.name || <i className="muted">Chưa đặt tên</i>}</b>
                    <span className="small muted wf-meta">
                      <span className={'wf-kind ' + KIND[s.kind].c}>{KIND[s.kind].t}</span>
                      {def.lanes.find((l) => l.id === s.lane)?.name} · {who(s.assignee, dir)}
                      {s.sla_hours ? ` · ${s.sla_hours} giờ` : ''}{s.checklist?.length ? ` · ${s.checklist.length} điều kiện` : ''}{s.managers?.length ? ` · ${s.managers.length} quản trị` : ''}{s.watchers?.length ? ` · ${s.watchers.length} theo dõi` : ''}
                      {s.allow_back ? ' · trả lại' : ''}{s.allow_fail ? ' · Fail' : ''}
                    </span>
                  </span>
                  {se.length > 0 && <Icon name="alert" size={16} />}
                </button>
                {isOpen && <StepForm s={s} i={i} n={def.steps.length} def={def} dir={dir} ro={ro} set={(p) => setStep(s.id, p)}
                  onMove={(d) => move(i, d)} onDup={() => dup(i)} onDel={() => del(i)} />}
              </article>
              {!ro && <Insert onClick={() => insertAt(i + 1)} />}
            </div>);
        })}
        <div className="wf-node end">Kết thúc · Hoàn tất</div>
      </section>
      </>}
    </div>
  );
}

const Insert = ({ onClick }: { onClick: () => void }) => (
  <button className="wf-insert" onClick={onClick} aria-label="Chèn bước ở đây"><Icon name="plus" size={16} /></button>
);

function StepForm({ s, i, n, def, dir, ro, set, onMove, onDup, onDel }: {
  s: Step; i: number; n: number; def: Def; dir: Directory | null; ro: boolean;
  set: (p: Partial<Step>) => void; onMove: (d: number) => void; onDup: () => void; onDel: () => void;
}) {
  const [item, setItem] = useState('');
  const setItems = (v: CheckItem[]) => set({ checklist: v });
  const addItem = (kind: CheckItem['kind']) => { const t = item.trim() || (kind === 'file' ? 'Tài liệu đính kèm' : ''); if (!t) return; setItems([...items(s), { id: uid('c'), text: t, kind }]); setItem(''); };
  return (
    <fieldset className="wf-form" disabled={ro}>
      <label className="f"><span>Tên bước</span><input value={s.name} autoFocus={!s.name} placeholder="Ví dụ: Kiểm tra bản vẽ" onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="wf-2">
        <label className="f"><span>Loại bước</span>
          <select value={s.kind} onChange={(e) => set({ kind: e.target.value as StepKind })}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></label>
        <label className="f"><span>Làn</span>
          <select value={s.lane} onChange={(e) => set({ lane: e.target.value })}>
            {def.lanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      </div>
      <div className="wf-2">
        <label className="f"><span>Người làm theo</span>
          <select value={s.assignee.type} onChange={(e) => set({ assignee: { type: e.target.value as Step['assignee']['type'], id: '' } })}>
            <option value="user">Một người</option><option value="group">Nhóm làm việc</option><option value="role">Vai trò</option></select></label>
        <label className="f"><span>Người làm</span>
          <select value={s.assignee.id} onChange={(e) => set({ assignee: { ...s.assignee, id: e.target.value } })}>
            <option value="">{i === 0 ? '— Chọn —' : '— Chưa xác định (người quản trị phân công) —'}</option>
            {s.assignee.type === 'user' && dir?.users.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.unit}</option>)}
            {s.assignee.type === 'group' && dir?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            {s.assignee.type === 'role' && dir?.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
          </select></label>
      </div>
      <label className="f" style={{ maxWidth: 220 }}><span>Hạn xử lý (giờ, 0 = không hạn)</span>
        <input type="number" min={0} inputMode="numeric" value={s.sla_hours ?? 0} onChange={(e) => set({ sla_hours: Math.max(0, Number(e.target.value) || 0) })} /></label>

      {(def.fields ?? []).length > 0 && <div className="f"><span>Quyền với biểu mẫu ở bước này</span>
        <div className="wf-perms">{(def.fields ?? []).map((f) => (
          <div key={f.id} className="wf-perm"><span>{f.label || <i className="muted">(chưa đặt tên)</i>}</span>
            <div className="wf-seg" role="radiogroup" aria-label={'Quyền: ' + f.label}>{(Object.keys(PERM) as Perm[]).map((p) => (
              <button key={p} role="radio" aria-checked={(s.perms?.[f.id] ?? 'view') === p} className={(s.perms?.[f.id] ?? 'view') === p ? 'on p-' + p : ''}
                onClick={() => set({ perms: { ...(s.perms ?? {}), [f.id]: p } })}>{PERM[p]}</button>))}</div></div>))}</div></div>}

      <ApprovalEditor s={s} def={def} dir={dir} ro={ro} set={set} />

      <Routing s={s} i={i} def={def} ro={ro} set={set} />

      <People label="Người quản trị giai đoạn" hint="Sửa nội dung bước, phân công / đổi người làm khi việc tới mà chưa xác định được người làm."
        list={s.managers ?? []} dir={dir} ro={ro} onChange={(v) => set({ managers: v })} />
      <People label="Người theo dõi" hint="Thấy các việc đang ở bước này (chỉ xem)." list={s.watchers ?? []} dir={dir} ro={ro} onChange={(v) => set({ watchers: v })} />

      <div className="f"><span>Checklist bắt buộc trước khi chuyển bước</span>
        {items(s).map((c, k) => (
          <div key={c.id} className="wf-ck"><Icon name={c.kind === 'file' ? 'upload' : 'check'} size={14} />
            {ro ? <span style={{ flex: 1 }}>{c.text}</span> :
              <input className="wf-ck-in" value={c.text} aria-label="Nội dung mục" onChange={(e) => setItems(items(s).map((x, j) => j === k ? { ...x, text: e.target.value } : x))} />}
            <select className="wf-ck-kind" value={c.kind} aria-label="Loại mục" onChange={(e) => setItems(items(s).map((x, j) => j === k ? { ...x, kind: e.target.value as CheckItem['kind'] } : x))}>
              <option value="check">Tích xác nhận</option><option value="file">Phải tải file</option></select>
            {!ro && <button aria-label={'Bỏ ' + c.text} onClick={() => setItems(items(s).filter((_, x) => x !== k))}><Icon name="x" size={14} /></button>}</div>))}
        {!ro && <div className="row"><input style={{ flex: 1 }} value={item} placeholder="Thêm điều kiện, Enter để thêm" onChange={(e) => setItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem('check'); } }} />
          <button className="btn sm" onClick={() => addItem('check')}>+ Tích</button><button className="btn sm" onClick={() => addItem('file')}><Icon name="upload" size={14} />+ Tải file</button></div>}
      </div>

      <div className="wf-toggles">
        <label><input type="checkbox" checked={!!s.allow_back} disabled={i === 0} onChange={(e) => set({ allow_back: e.target.checked })} />Cho trả lại bước trước</label>
        <label><input type="checkbox" checked={!!s.allow_fail} onChange={(e) => set({ allow_fail: e.target.checked })} />Cho từ chối (Fail, dừng quy trình)</label>
        <label><input type="checkbox" checked={!!s.require_note} onChange={(e) => set({ require_note: e.target.checked })} />Bắt buộc ghi chú khi xong</label>
      </div>
      <label className="f"><span>Hướng dẫn cho người làm</span><textarea rows={2} value={s.guide ?? ''} onChange={(e) => set({ guide: e.target.value })} /></label>

      {!ro && <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <button className="btn sm" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Lên trên">↑ Lên</button>
          <button className="btn sm" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Xuống dưới">↓ Xuống</button>
          <button className="btn sm" onClick={onDup}>Nhân bản</button>
        </div>
        <button className="btn sm danger" onClick={onDel}><Icon name="x" size={16} />Xoá bước</button>
      </div>}
    </fieldset>
  );
}

/** Chọn nhiều người / nhóm / vai trò */
function People({ label, hint, list, dir, ro, onChange }: { label: string; hint: string; list: Assignee[]; dir: Directory | null; ro: boolean; onChange: (v: Assignee[]) => void }) {
  const [type, setType] = useState<Assignee['type']>('user');
  const opts = type === 'user' ? dir?.users.map((u) => [u.id, u.full_name + ' · ' + u.unit]) : type === 'group' ? dir?.groups.map((g) => [g.id, g.name]) : dir?.roles.map((r) => [r, ROLE_LABEL[r] ?? r]);
  return (
    <div className="f"><span>{label}</span><small className="muted">{hint}</small>
      {list.length > 0 && <div className="row">{list.map((a, k) => (
        <span key={a.type + a.id} className="wf-pill">{who(a, dir)}{!ro && <button aria-label={'Bỏ ' + who(a, dir)} onClick={() => onChange(list.filter((_, x) => x !== k))}><Icon name="x" size={12} /></button>}</span>))}</div>}
      {!ro && <div className="wf-2" style={{ gridTemplateColumns: '140px 1fr' }}>
        <select value={type} aria-label={label + ': loại'} onChange={(e) => setType(e.target.value as Assignee['type'])}><option value="user">Người</option><option value="group">Nhóm</option><option value="role">Vai trò</option></select>
        <select value="" aria-label={label + ': thêm'} onChange={(e) => { const id = e.target.value; if (id && !list.some((a) => a.type === type && a.id === id)) onChange([...list, { type, id }]); }}>
          <option value="">+ Thêm…</option>{opts?.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></div>}
    </div>);
}

/** Biểu mẫu dùng chung cho cả quy trình; mỗi bước đặt quyền Ẩn / Xem / Sửa / Bắt buộc */
function FieldsEditor({ fields, ro, onChange }: { fields: Field[]; ro: boolean; onChange: (f: Field[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const setF = (i: number, p: Partial<Field>) => onChange(fields.map((f, j) => j === i ? { ...f, ...p } : f));
  const add = (type: Field['type']) => {
    const f: Field = { id: uid('f'), label: '', type, ...(type === 'table' ? { columns: [{ id: 'c1', label: 'Cột 1', type: 'text' }] } : type === 'select' ? { options: ['Có', 'Không'] } : {}) };
    onChange([...fields, f]); setOpen(f.id);
  };
  return (
    <section className="card" aria-label="Biểu mẫu">
      <div className="row" style={{ justifyContent: 'space-between' }}><div><b>Biểu mẫu</b><div className="small muted">Các trường dữ liệu đi theo hồ sơ. Ở từng bước chọn trường nào được sửa, bắt buộc, chỉ xem hay ẩn.</div></div></div>
      <div className="steps" style={{ marginTop: 8 }}>
        {fields.map((f, i) => (
          <div key={f.id} className="wf-field">
            <button className="wf-step-h" style={{ minHeight: 44, padding: '6px 10px' }} aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
              <span className="wf-kind">{FTYPE[f.type]}</span><b style={{ flex: 1, textAlign: 'left' }}>{f.label || <i className="muted">Chưa đặt tên</i>}</b>
              {f.type === 'table' && <span className="small muted">{f.columns?.length ?? 0} cột</span>}</button>
            {open === f.id && <fieldset className="wf-form" disabled={ro}>
              <div className="wf-2">
                <label className="f"><span>Tên trường</span><input value={f.label} autoFocus={!f.label} onChange={(e) => setF(i, { label: e.target.value })} /></label>
                <label className="f"><span>Kiểu</span><select value={f.type} onChange={(e) => setF(i, { type: e.target.value as Field['type'], ...(e.target.value === 'table' && !f.columns ? { columns: [{ id: 'c1', label: 'Cột 1', type: 'text' }] } : {}) })}>
                  {Object.entries(FTYPE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              </div>
              <label className="f"><span>Gợi ý nhập (tuỳ chọn)</span><input value={f.help ?? ''} onChange={(e) => setF(i, { help: e.target.value })} /></label>
              {f.type === 'select' && <label className="f"><span>Các lựa chọn (mỗi dòng một lựa chọn)</span>
                <textarea rows={3} value={(f.options ?? []).join('\n')} onChange={(e) => setF(i, { options: e.target.value.split('\n') })} onBlur={() => setF(i, { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })} /></label>}
              {f.type === 'table' && <ColumnsEditor cols={f.columns ?? []} onChange={(c) => setF(i, { columns: c })} />}
              {!ro && <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row"><button className="btn sm" disabled={i === 0} onClick={() => { const a = [...fields]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }}>↑ Lên</button>
                  <button className="btn sm" disabled={i === fields.length - 1} onClick={() => { const a = [...fields]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange(a); }}>↓ Xuống</button></div>
                <button className="btn sm danger" onClick={async () => { if (await confirmDialog(`Xoá trường "${f.label}"? Dữ liệu đã nhập ở các lượt chạy cũ vẫn giữ.`, 'Xoá')) onChange(fields.filter((_, j) => j !== i)); }}><Icon name="x" size={16} />Xoá trường</button>
              </div>}
            </fieldset>}
          </div>))}
      </div>
      {!ro && <div className="row" style={{ marginTop: 8 }}><span className="small muted">Thêm trường:</span>
        {(Object.keys(FTYPE) as Field['type'][]).map((t) => <button key={t} className="btn sm" onClick={() => add(t)}><Icon name="plus" size={14} />{FTYPE[t]}</button>)}</div>}
    </section>);
}

function ColumnsEditor({ cols, onChange }: { cols: Column[]; onChange: (c: Column[]) => void }) {
  const set = (i: number, p: Partial<Column>) => onChange(cols.map((c, j) => j === i ? { ...c, ...p } : c));
  return (
    <div className="f"><span>Các cột của bảng</span>
      <small className="muted">Công thức dùng mã cột, ví dụ <code>m2_tam * so_tam</code>. Cột công thức tự tính, không nhập tay. Thứ tự cột nhập = thứ tự dán từ Excel.</small>
      <div className="wf-cols">
        <div className="wf-col h"><span>Mã</span><span>Tên cột</span><span>Kiểu</span><span>Công thức</span><span>Σ</span><span /></div>
        {cols.map((c, i) => (
          <div key={i} className="wf-col">
            <input aria-label="Mã cột" value={c.id} onChange={(e) => set(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') })} />
            <input aria-label="Tên cột" value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
            <select aria-label="Kiểu cột" value={c.type} onChange={(e) => set(i, { type: e.target.value as Column['type'] })}><option value="text">Chữ</option><option value="number">Số</option></select>
            <input aria-label="Công thức" placeholder="(nhập tay)" value={c.formula ?? ''} onChange={(e) => set(i, { formula: e.target.value || undefined, ...(e.target.value ? { type: 'number' } : {}) })} />
            <input type="checkbox" aria-label="Cộng tổng" checked={!!c.sum} onChange={(e) => set(i, { sum: e.target.checked })} />
            <button className="wf-x" aria-label={'Xoá cột ' + c.label} onClick={() => onChange(cols.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
          </div>))}
      </div>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...cols, { id: 'c' + (cols.length + 1), label: 'Cột ' + (cols.length + 1), type: 'text' }])}><Icon name="plus" size={14} />Thêm cột</button>
    </div>);
}

/** Sau bước này đi đâu: các nhánh điều kiện (xét lần lượt) + đường mặc định */
function Routing({ s, i, def, ro, set }: { s: Step; i: number; def: Def; ro: boolean; set: (p: Partial<Step>) => void }) {
  const fs = condFields(def); const routes = s.routes ?? [];
  const stepOpts = <>{def.steps.map((x, k) => k === i ? null : <option key={x.id} value={x.id}>{k + 1}. {x.name || '(chưa đặt tên)'}</option>)}<option value={END}>■ Kết thúc quy trình</option></>;
  const setR = (k: number, p: Partial<Route>) => set({ routes: routes.map((r, j) => j === k ? { ...r, ...p } : r) });
  return (
    <div className="f"><span>Sau bước này</span>
      {routes.map((r, k) => (
        <div key={r.id} className="wf-route">
          <b className="small">{k === 0 ? 'Nếu' : 'Hoặc nếu'}</b>
          <select aria-label="Trường" value={r.field} onChange={(e) => setR(k, { field: e.target.value })}><option value="">— trường —</option>{fs.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          <select aria-label="Phép so sánh" value={r.op} onChange={(e) => setR(k, { op: e.target.value as Op })}>{Object.entries(OPS).map(([o, t]) => <option key={o} value={o}>{t}</option>)}</select>
          {r.op !== 'empty' && r.op !== 'filled' && <input aria-label="Giá trị" placeholder="giá trị" value={r.value ?? ''} onChange={(e) => setR(k, { value: e.target.value })} />}
          <b className="small">thì sang</b>
          <select aria-label="Bước đến" value={r.goto} onChange={(e) => setR(k, { goto: e.target.value })}><option value="">— bước —</option>{stepOpts}</select>
          {!ro && <button className="wf-x" aria-label="Xoá nhánh" onClick={() => set({ routes: routes.filter((_, j) => j !== k) })}><Icon name="x" size={14} /></button>}
        </div>))}
      <div className="wf-route"><b className="small">{routes.length ? 'Còn lại thì sang' : 'Sang'}</b>
        <select aria-label="Bước mặc định tiếp theo" value={s.next ?? ''} onChange={(e) => set({ next: e.target.value || undefined })}>
          <option value="">Bước kế tiếp trong danh sách{def.steps[i + 1] ? ` (${def.steps[i + 1].name || i + 2})` : ' (kết thúc)'}</option>{stepOpts}</select></div>
      {!ro && <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!fs.length} title={fs.length ? '' : 'Cần có trường trong Biểu mẫu để đặt điều kiện'}
        onClick={() => set({ routes: [...routes, { id: uid('r'), field: '', op: 'gt', value: '', goto: '' }] })}><Icon name="plus" size={14} />Thêm nhánh điều kiện</button>}
      {!fs.length && <small className="muted">Thêm trường ở Biểu mẫu để rẽ nhánh theo dữ liệu (ví dụ Tổng tiền &gt; 500.000.000 thì sang Giám đốc duyệt).</small>}
    </div>);
}

/** Luồng duyệt linh hoạt: nhiều cấp nối tiếp, mỗi cấp có người duyệt, quy tắc đạt, điều kiện áp dụng, hạn */
function ApprovalEditor({ s, def, dir, ro, set }: { s: Step; def: Def; dir: Directory | null; ro: boolean; set: (p: Partial<Step>) => void }) {
  const ap = s.approval; const levels = ap?.levels ?? []; const fs = condFields(def);
  const setL = (k: number, p: Partial<ApprLevel>) => set({ approval: { on_reject: ap?.on_reject ?? 'restart', levels: levels.map((l, j) => j === k ? { ...l, ...p } : l) } });
  const lv = (name: string, rule: ApprLevel['rule'] = 'all', min?: number): ApprLevel => ({ id: uid('a'), name, approvers: [], rule, min, sla_hours: 8 });
  const preset = (ls: ApprLevel[]) => set({ approval: { on_reject: 'restart', levels: ls } });
  const mv = (k: number, d: number) => { const a = [...levels]; [a[k], a[k + d]] = [a[k + d], a[k]]; set({ approval: { on_reject: ap?.on_reject ?? 'restart', levels: a } }); };
  return (
    <div className="f"><span>Luồng duyệt</span>
      {!levels.length ? <>
        <small className="muted">Bật khi bước cần một hoặc nhiều người duyệt. Người làm bấm "Gửi duyệt"; duyệt đủ các cấp thì quy trình tự sang bước sau.</small>
        {!ro && <div className="row">
          <button className="btn sm" onClick={() => preset([lv('Duyệt')])}>1 cấp</button>
          <button className="btn sm" onClick={() => preset([lv('Trưởng bộ phận'), lv('Giám đốc')])}>2 cấp nối tiếp</button>
          <button className="btn sm" onClick={() => preset([lv('Hội đồng', 'min', 2)])}>Hội đồng (tối thiểu 2)</button>
          <button className="btn sm" onClick={() => preset([lv('Trưởng bộ phận'), { ...lv('Giám đốc'), when: { field: fs[0]?.id ?? '', op: 'gt', value: '500000000' } }])}>Có cấp theo điều kiện</button>
        </div>}
      </> : <>
        <ol className="wf-levels">{levels.map((l, k) => (
          <li key={l.id} className="wf-level">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="row" style={{ flexWrap: 'nowrap', flex: 1, minWidth: 0 }}><b className="wf-lvno">{k + 1}</b>
                <input className="wf-ck-in" aria-label="Tên cấp duyệt" value={l.name} placeholder={'Cấp ' + (k + 1)} onChange={(e) => setL(k, { name: e.target.value })} /></span>
              {!ro && <span className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                <button className="wf-x" disabled={k === 0} aria-label="Lên" onClick={() => mv(k, -1)}>↑</button>
                <button className="wf-x" disabled={k === levels.length - 1} aria-label="Xuống" onClick={() => mv(k, 1)}>↓</button>
                <button className="wf-x" aria-label={'Xoá cấp ' + (k + 1)} onClick={() => set({ approval: levels.length > 1 ? { on_reject: ap!.on_reject, levels: levels.filter((_, j) => j !== k) } : undefined })}><Icon name="x" size={14} /></button></span>}
            </div>
            <People label="Người duyệt" hint="Người, nhóm hoặc vai trò; mọi thành viên của nhóm/vai trò đều nhận phiếu." list={l.approvers} dir={dir} ro={ro} onChange={(v) => setL(k, { approvers: v })} />
            <div className="wf-2">
              <label className="f"><span>Quy tắc đạt</span><select value={l.rule} onChange={(e) => setL(k, { rule: e.target.value as ApprLevel['rule'] })}>{Object.entries(RULE).map(([r, t]) => <option key={r} value={r}>{t}</option>)}</select></label>
              {l.rule === 'min' ? <label className="f"><span>Số người tối thiểu</span><input type="number" min={1} value={l.min ?? 1} onChange={(e) => setL(k, { min: Math.max(1, Number(e.target.value) || 1) })} /></label>
                : <label className="f"><span>Hạn duyệt (giờ)</span><input type="number" min={0} value={l.sla_hours ?? 0} onChange={(e) => setL(k, { sla_hours: Math.max(0, Number(e.target.value) || 0) })} /></label>}
            </div>
            <div className="wf-route"><label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!l.when} disabled={!fs.length}
              onChange={(e) => setL(k, { when: e.target.checked ? { field: fs[0]?.id ?? '', op: 'gt', value: '' } : undefined })} />Chỉ áp dụng khi</label>
              {l.when && <>
                <select aria-label="Trường" value={l.when.field} onChange={(e) => setL(k, { when: { ...l.when!, field: e.target.value } })}>{fs.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                <select aria-label="So sánh" value={l.when.op} onChange={(e) => setL(k, { when: { ...l.when!, op: e.target.value as Op } })}>{Object.entries(OPS).map(([o, t]) => <option key={o} value={o}>{t}</option>)}</select>
                {l.when.op !== 'empty' && l.when.op !== 'filled' && <input aria-label="Giá trị" value={l.when.value ?? ''} onChange={(e) => setL(k, { when: { ...l.when!, value: e.target.value } })} />}
              </>}
              {!l.when && <small className="muted">{fs.length ? '(luôn áp dụng)' : '(cần trường trong Biểu mẫu)'}</small>}
            </div>
          </li>))}</ol>
        {!ro && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ approval: { on_reject: ap?.on_reject ?? 'restart', levels: [...levels, lv('Cấp ' + (levels.length + 1))] } })}><Icon name="plus" size={14} />Thêm cấp duyệt</button>}
        <label className="f"><span>Khi bị từ chối</span><select value={ap?.on_reject ?? 'restart'} onChange={(e) => set({ approval: { levels, on_reject: e.target.value as 'restart' } })}>
          {Object.entries(ON_REJECT).map(([r, t]) => <option key={r} value={r}>{t}</option>)}</select></label>
      </>}
    </div>);
}
