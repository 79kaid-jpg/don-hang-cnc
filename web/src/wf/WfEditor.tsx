import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { Msg, Skeleton, confirmDialog, toast } from '../components/ui';
import { KIND, ROLE_LABEL, VSTATUS, emptyDef, items, loadDirectory, newStep, uid, validate, who,
  type Assignee, type CheckItem, type Def, type Directory, type Process, type Step, type StepKind, type Version } from './model';

const LANE_COLORS = ['#B8862B', '#2F6FB0', '#3B8E5A', '#8A4FB0', '#C0504D', '#5B7083'];

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
