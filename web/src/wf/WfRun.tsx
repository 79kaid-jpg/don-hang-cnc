import { viewUrl } from '../lib/viewer';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { Msg, Skeleton, confirmDialog, toast } from '../components/ui';
import { FormView } from './Form';
import { ISTATUS, KIND, TSTATUS, computeRow, fmtDT, hasAppr, items, loadDirectory, ntype, slaLeft, userName, who,
  type ApprRow, type Def, type Directory, type Instance, type Task, type Version } from './model';

type Ev = { id: number; action: string; detail: string; actor: string; real_actor: string; at: string };
type Rights = { do: boolean; manage: boolean; watch: boolean };

/** Màn hình một hồ sơ: có thể có nhiều việc mở cùng lúc (nhánh song song) – mỗi việc là một thẻ riêng */
export default function WfRun() {
  const { id } = useParams();
  const { me, can } = useAuth();
  const [ins, setIns] = useState<Instance | null>(null);
  const [ver, setVer] = useState<(Version & { p: { name: string } }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [dir, setDir] = useState<Directory | null>(null);
  const [apprs, setApprs] = useState<ApprRow[]>([]);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [dataDirty, setDataDirty] = useState(false);
  const [children, setChildren] = useState<{ id: string; title: string; status: Instance['status']; parent_task: string }[]>([]);
  const [parent, setParent] = useState<{ id: string; title: string } | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  const load = async () => {
    const i = await sb.from('wf_instances').select('*').eq('id', id).single();
    if (i.error) return setErr(errText(i.error));
    const inst = i.data as Instance & { parent_task?: string | null }; setIns(inst); setData(inst.data ?? {}); setDataDirty(false);
    const [v, t, e, ap] = await Promise.all([
      sb.from('wf_versions').select('*, p:wf_processes(name)').eq('id', inst.version_id).single(),
      sb.from('wf_tasks').select('*').eq('instance_id', id).order('created_at'),
      sb.from('wf_events').select('*').eq('instance_id', id).order('id'),
      sb.from('wf_approvals').select('*, wf_tasks!inner(instance_id)').eq('wf_tasks.instance_id', id).order('created_at')]);
    const ts = (t.data ?? []) as Task[];
    setVer(v.data as Version & { p: { name: string } }); setTasks(ts); setEvs((e.data ?? []) as Ev[]); setApprs((ap.data ?? []) as ApprRow[]);
    const subIds = ts.filter((x) => x.kind === 'sub').map((x) => x.id);
    if (subIds.length) { const { data: c } = await sb.from('wf_instances').select('id, title, status, parent_task').in('parent_task', subIds); setChildren((c ?? []) as typeof children); } else setChildren([]);
    if (inst.parent_task) {
      const { data: pt } = await sb.from('wf_tasks').select('instance_id, wf_instances(title)').eq('id', inst.parent_task).single();
      const p = pt as unknown as { instance_id: string; wf_instances: { title: string } } | null;
      setParent(p ? { id: p.instance_id, title: p.wf_instances?.title ?? '' } : null);
    } else setParent(null);
    setTick((x) => x + 1);
  };
  useEffect(() => { load(); loadDirectory().then(setDir); }, [id]);

  if (!ins || !ver) return err ? <Msg err={err} /> : <Skeleton />;
  const def: Def = ver.def;
  const open = tasks.filter((t) => t.status === 'cho');
  const openFile = async (path: string) => { const { data } = await sb.storage.from('files').createSignedUrl(path, 600); if (data?.signedUrl) viewUrl(data.signedUrl, path.split('/').pop() ?? 'file'); };
  // lưu biểu mẫu qua một việc mà người dùng có quyền sửa (dữ liệu dùng chung cho cả hồ sơ)
  const saveData = async (taskId: string, quiet = false) => {
    if (!dataDirty) return true;
    const out: Record<string, unknown> = { ...data };
    for (const f of def.fields ?? []) if (f.type === 'table' && Array.isArray(out[f.id])) out[f.id] = (out[f.id] as Record<string, unknown>[]).map((r) => computeRow(f.columns ?? [], r));
    const { error } = await sb.rpc('wf_save_data', { p_task: taskId, p_data: out });
    if (error) { setErr(errText(error)); return false; }
    setDataDirty(false); if (!quiet) toast('Đã lưu biểu mẫu'); return true;
  };
  const cancel = async () => {
    const r = prompt('Lý do huỷ lượt chạy'); if (!r) return;
    const { error } = await sb.rpc('wf_cancel', { p_inst: ins.id, p_note: r });
    if (error) return setErr(errText(error)); toast('Đã huỷ'); load();
  };
  const stepState = (sid: string) => open.some((t) => t.step_id === sid) ? 'cur' : tasks.some((t) => t.step_id === sid && t.status === 'xong') ? 'done' : tasks.some((t) => t.step_id === sid && t.status === 'fail') ? 'bad' : '';
  const shownSteps = def.steps.filter((s) => ['task', 'subprocess'].includes(ntype(s)));

  return (
    <div className="wf" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-head">
        <div><Link to="/quy-trinh-moi" className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="back" size={14} />Trình tạo quy trình</Link>
          <h1>{ins.title}</h1>
          <div className="row small muted"><span>{ver.p?.name} · bản {ver.version}</span>
            {ins.order_id && <Link to={'/don/' + ins.order_id} className="chip idle" style={{ textDecoration: 'none' }}><Icon name="file" size={13} />Mở đơn hàng</Link>}
            {parent && <Link to={'/quy-trinh-moi/chay/' + parent.id} className="chip idle" style={{ textDecoration: 'none' }}><Icon name="flow" size={13} />Quy trình cha: {parent.title}</Link>}
            <span className={'chip ' + ({ dang_chay: 'wait', hoan_tat: 'done', fail: 'bad', huy: 'idle' }[ins.status])}>{ISTATUS[ins.status]}</span>
            {ins.is_test && <span className="chip idle">Chạy thử</span>}</div></div>
        <div className="row">
          <Link className="btn sm" to={'/quy-trinh-moi/in/' + ins.id}><Icon name="print" size={16} />In A4</Link>
          {ins.status === 'dang_chay' && (can('admin_it') || ins.started_by === me?.id) && <button className="btn sm danger" onClick={cancel}>Huỷ lượt chạy</button>}
        </div>
      </div>
      <Msg err={err} />

      <ol className="wf-progress" aria-label="Tiến trình">
        {shownSteps.map((s, i) => { const st = stepState(s.id); return (
          <li key={s.id} className={st} aria-current={st === 'cur' ? 'step' : undefined}><span>{i + 1}</span><em>{s.name}</em></li>); })}
      </ol>

      {ins.status === 'dang_chay' && open.length > 1 && <div className="msg small" role="status" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
        <Icon name="flow" size={16} />Hồ sơ đang chạy song song {open.filter((t) => t.kind !== 'join').length} nhánh.</div>}

      {ins.status === 'dang_chay' && open.map((t) => {
        const st = def.steps.find((s) => s.id === t.step_id); if (!st) return null;
        if (t.kind === 'join') return <section key={t.id} className="card wf-now wf-sys"><b><Icon name="flow" size={16} /> {st.name || 'Gộp'}</b>
          <span className="small muted">Đã có {t.join_from?.length ?? 0} nhánh tới · {st.join_mode === 'any' ? 'chỉ cần một nhánh' : 'đang chờ các nhánh còn lại xong'}</span></section>;
        if (t.kind === 'sub') { const c = children.find((x) => x.parent_task === t.id); return <section key={t.id} className="card wf-now wf-sys"><b><Icon name="flow" size={16} /> {st.name || 'Quy trình con'}</b>
          <span className="small muted">Đang chờ quy trình con hoàn tất.</span>
          {c && <Link className="btn sm" style={{ alignSelf: 'flex-start' }} to={'/quy-trinh-moi/chay/' + c.id}>Mở {c.title} · {ISTATUS[c.status]}</Link>}</section>; }
        return <TaskCard key={t.id + tick} t={t} def={def} ins={ins} dir={dir} meId={me?.id} apprs={apprs.filter((a) => a.task_id === t.id)}
          data={data} onData={(k, v) => { setData((d) => ({ ...d, [k]: v })); setDataDirty(true); }} dataDirty={dataDirty}
          saveData={(q) => saveData(t.id, q)} reload={load} setErr={setErr} openFile={openFile} />;
      })}

      {ins.status !== 'dang_chay' && (def.fields ?? []).length > 0 && <section className="card" aria-label="Biểu mẫu"><b>Biểu mẫu</b>
        <FormView fields={def.fields ?? []} perms={{}} data={data} locked onChange={() => {}} /></section>}

      <section className="card" aria-label="Lịch sử">
        <b>Lịch sử xử lý</b>
        <ol className="wf-log">
          {tasks.filter((t) => t.kind === 'task' || t.kind === 'sub').map((t) => (
            <li key={t.id} className={'t-' + t.status}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{t.step_name}</b><span className="small muted">{TSTATUS[t.status]}</span></div>
              <div className="small muted">Mở {fmtDT(t.created_at)}{t.done_at ? ` · xử lý ${fmtDT(t.done_at)}${t.done_by ? ' bởi ' + userName(t.done_by, dir) : ''}` : ''}</div>
              {t.note && <div className="small">“{t.note}”</div>}
              {t.status !== 'cho' && t.files?.length > 0 && <div className="row small">{t.files.map((f) => <button key={f.path} className="linkish" onClick={() => openFile(f.path)}><Icon name="file" size={13} /> {f.name}</button>)}</div>}
            </li>))}
        </ol>
        <details><summary className="small muted">Nhật ký chi tiết ({evs.length})</summary>
          <ul className="small">{evs.map((e) => <li key={e.id}>{fmtDT(e.at)} · {userName(e.actor, dir)}{e.real_actor && e.real_actor !== e.actor ? ` (IT ${userName(e.real_actor, dir)} đóng vai)` : ''}: {e.detail}</li>)}</ul></details>
      </section>
    </div>
  );
}

/** Thẻ một việc đang mở: người làm, biểu mẫu, checklist, luồng duyệt, nút xử lý */
function TaskCard({ t, def, ins, dir, meId, apprs, data, onData, dataDirty, saveData, reload, setErr, openFile }: {
  t: Task; def: Def; ins: Instance; dir: Directory | null; meId?: string; apprs: ApprRow[]; data: Record<string, unknown>;
  onData: (k: string, v: unknown) => void; dataDirty: boolean; saveData: (quiet?: boolean) => Promise<boolean>;
  reload: () => void; setErr: (s: string) => void; openFile: (p: string) => void;
}) {
  const cur = def.steps.find((s) => s.id === t.step_id)!;
  const [rights, setRights] = useState<Rights>({ do: false, manage: false, watch: false });
  const [ck, setCk] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState(''); const [pick, setPick] = useState(''); const [busyItem, setBusyItem] = useState(''); const [apNote, setApNote] = useState('');
  useEffect(() => { sb.rpc('wf_task_rights', { p_task: t.id }).then(({ data }) => setRights((data as Rights) ?? { do: false, manage: false, watch: false })); }, [t.id]);

  const appr = hasAppr(cur); const inAppr = t.appr_state === 'dang_duyet';
  const canAct = rights.do && !inAppr; const canEdit = rights.do || rights.manage;
  const round = apprs.reduce((m, a) => Math.max(m, a.round), 0);
  const myAppr = apprs.find((a) => a.status === 'cho' && a.approver === meId);
  const unassigned = !t.assigned_to && !cur.assignee?.id;
  const filesOf = (key: string) => (t.files ?? []).filter((f) => f.item === key);
  const ckDone = items(cur).every((c) => c.kind === 'file' ? filesOf(c.id).length > 0 : ck[c.id]);
  const sla = slaLeft(t.due_at);

  const upload = async (key: string, fl: FileList | null) => {
    if (!fl?.length) return; setBusyItem(key); setErr('');
    for (const file of Array.from(fl)) {
      const path = `wf/${ins.id}/${t.id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const r = await sb.storage.from('files').upload(path, file);
      if (r.error) { setErr(errText(r.error)); break; }
      const { error } = await sb.rpc('wf_task_file', { p_task: t.id, p_item: key, p_name: file.name, p_path: path, p_remove: false });
      if (error) { setErr(errText(error)); break; }
    }
    setBusyItem(''); reload();
  };
  const unlink = async (path: string, name: string) => {
    if (!(await confirmDialog(`Gỡ file "${name}" khỏi bước này?`, 'Gỡ file'))) return;
    const { error } = await sb.rpc('wf_task_file', { p_task: t.id, p_item: '', p_name: name, p_path: path, p_remove: true });
    if (error) return setErr(errText(error)); reload();
  };
  const assign = async () => {
    if (!pick) return;
    const { error } = await sb.rpc('wf_assign', { p_task: t.id, p_user: pick, p_note: '' });
    if (error) return setErr(errText(error)); toast('Đã phân công'); reload();
  };
  const act = async (action: 'next' | 'back' | 'fail') => {
    if (!(await saveData(true))) return;
    if (action !== 'next' && !note.trim()) return setErr(action === 'back' ? 'Ghi lý do trả lại' : 'Ghi lý do từ chối');
    if (action === 'fail' && !(await confirmDialog('Từ chối và dừng quy trình (Fail)? Mọi nhánh đang chạy sẽ bị huỷ.', 'Fail'))) return;
    const { data: r, error } = await sb.rpc('wf_act', { p_task: t.id, p_action: action, p_note: note, p_checklist: ck });
    if (error) return setErr(errText(error));
    setErr(''); toast(action === 'next' ? (r === 'hoan_tat' ? 'Hoàn tất quy trình' : 'Đã chuyển: ' + r) : action === 'back' ? 'Đã trả lại' : 'Đã Fail');
    reload();
  };
  const submit = async () => {
    if (!(await saveData(true))) return;
    const { data: r, error } = await sb.rpc('wf_submit_approval', { p_task: t.id, p_note: note, p_checklist: ck });
    if (error) return setErr(errText(error)); setErr(''); toast(r === 'dat' ? 'Không cấp nào cần duyệt – đã chuyển bước' : 'Đã gửi duyệt'); reload();
  };
  const decide = async (a: ApprRow, ok: boolean) => {
    if (!ok && !apNote.trim()) return setErr('Ghi lý do từ chối');
    const { data: r, error } = await sb.rpc('wf_approve', { p_appr: a.id, p_ok: ok, p_note: apNote });
    if (error) return setErr(errText(error)); setErr('');
    toast(ok ? (r === 'dat' ? 'Đã duyệt – đủ các cấp, chuyển bước' : r === 'cap_sau' ? 'Đã duyệt – chuyển cấp sau' : 'Đã ghi ý kiến đồng ý') : 'Đã từ chối'); reload();
  };

  return (
    <section className="card wf-now" aria-label={'Việc: ' + cur.name}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><span className={'wf-kind ' + KIND[cur.kind].c}>{KIND[cur.kind].t}</span> <b style={{ fontSize: 18 }}>{cur.name}</b>
          <div className="small muted">Đang giao cho: <b>{t.assigned_to ? userName(t.assigned_to, dir) : who(cur.assignee, dir)}</b>
            {cur.managers?.length ? <> · Quản trị: {cur.managers.map((m) => who(m, dir)).join(', ')}</> : null}
            {cur.watchers?.length ? <> · Theo dõi: {cur.watchers.map((m) => who(m, dir)).join(', ')}</> : null}</div></div>
        {sla && <span className={'chip ' + (sla.late ? 'bad' : 'wait')}><Icon name="clock" size={13} />{sla.text}</span>}
      </div>
      {cur.guide && <p className="small" style={{ margin: 0 }}>{cur.guide}</p>}

      {rights.manage && (
        <div className="wf-assign">
          <Icon name="users" size={18} /><b className="small">{unassigned ? 'Việc chưa có người làm – phân công:' : 'Đổi người làm:'}</b>
          <select value={pick} aria-label="Chọn người làm" onChange={(e) => setPick(e.target.value)}>
            <option value="">— Chọn người —</option>{dir?.users.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.unit}</option>)}</select>
          <button className="btn sm primary" disabled={!pick} onClick={assign}>Phân công</button>
        </div>)}

      {(def.fields ?? []).length > 0 && <>
        <FormView fields={def.fields ?? []} perms={cur.perms ?? {}} data={data} locked={!canEdit} onChange={onData} />
        {canEdit && Object.values(cur.perms ?? {}).some((p) => p === 'edit' || p === 'required') &&
          <div className="row"><button className="btn sm" disabled={!dataDirty} onClick={() => saveData()}><Icon name="check" size={16} />Lưu biểu mẫu</button>{dataDirty && <span className="chip wait">Chưa lưu</span>}</div>}
      </>}

      {items(cur).length > 0 && <div className="f"><span>Checklist</span>
        {items(cur).map((c) => c.kind === 'file' ? (
          <div key={c.id} className={'wf-file' + (filesOf(c.id).length ? ' ok' : '')}>
            <Icon name={filesOf(c.id).length ? 'check' : 'upload'} size={16} /><b className="small" style={{ flex: '1 1 160px' }}>{c.text}</b>
            {filesOf(c.id).map((f) => <span key={f.path} className="row" style={{ gap: 4 }}>
              <button className="linkish" onClick={() => openFile(f.path)}>{f.name}</button>
              {canEdit && <button className="linkish small" aria-label={'Gỡ ' + f.name} onClick={() => unlink(f.path, f.name)}>(gỡ)</button>}</span>)}
            {canEdit && <label className="btn sm">{busyItem === c.id ? 'Đang tải…' : 'Tải file'}<input type="file" multiple hidden onChange={(e) => upload(c.id, e.target.files)} /></label>}
          </div>) : (
          <label key={c.id} className="wf-toggles" style={{ flexDirection: 'row' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
              <input type="checkbox" disabled={!canAct} checked={!!ck[c.id]} onChange={(e) => setCk({ ...ck, [c.id]: e.target.checked })} />{c.text}</span></label>))}
      </div>}

      {appr && <div className="f"><span>Luồng duyệt{t.appr_state === 'cho_sua' ? ' · bị từ chối, sửa rồi gửi duyệt lại' : inAppr ? ' · đang duyệt' : ' · chưa gửi'}</span>
        <div className="wf-appr">{cur.approval!.levels.map((l, k) => {
          const rows = apprs.filter((a) => a.round === round && a.level === k);
          return (
            <div key={l.id} className={'wf-appr-lv' + (inAppr && rows.some((a) => a.status === 'cho') ? ' cur' : '')}>
              <div className="row small" style={{ justifyContent: 'space-between' }}><b>{k + 1}. {l.name || 'Cấp ' + (k + 1)}</b>
                <span className="muted">{l.rule === 'all' ? 'Tất cả đồng ý' : l.rule === 'any' ? 'Một người là đạt' : `Tối thiểu ${l.min ?? 1} người`}{l.when ? ' · có điều kiện' : ''}</span></div>
              {rows.length ? rows.map((a) => (
                <div key={a.id} className="wf-appr-p"><Icon name="user" size={14} />{userName(a.approver, dir)}
                  <span className={'chip ' + ({ cho: 'wait', dong_y: 'done', tu_choi: 'bad', bo_qua: 'idle' }[a.status])}>{({ cho: 'Đang chờ', dong_y: 'Đồng ý', tu_choi: 'Từ chối', bo_qua: 'Không cần' })[a.status]}</span>
                  {a.decided_at && <span className="small muted">{fmtDT(a.decided_at)}</span>}{a.note && <span className="small">“{a.note}”</span>}</div>))
                : <div className="small muted">{l.approvers.map((x) => who(x, dir)).join(', ') || 'Chưa có người duyệt'}{round ? ' · không áp dụng / chưa tới' : ''}</div>}
            </div>);
        })}</div>
        {myAppr && <div className="wf-now" style={{ borderLeftColor: 'var(--blue)', paddingLeft: 10 }}>
          <b>Bạn cần duyệt: {myAppr.level_name}</b>
          <textarea rows={2} value={apNote} onChange={(e) => setApNote(e.target.value)} placeholder="Ý kiến (bắt buộc khi từ chối)" style={{ font: 'inherit', padding: 8, border: '1px solid var(--line2)', borderRadius: 8 }} />
          <div className="row wf-actions"><button className="btn primary" onClick={() => decide(myAppr, true)}><Icon name="check" size={18} />Đồng ý</button>
            <button className="btn danger" onClick={() => decide(myAppr, false)}><Icon name="x" size={18} />Từ chối</button></div>
        </div>}
      </div>}

      {canAct ? <>
        <label className="f"><span>Ghi chú{cur.require_note ? ' (bắt buộc)' : ''}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ý kiến, lý do trả lại / từ chối…" /></label>
        <div className="row wf-actions">
          {appr ? <button className="btn primary" disabled={!ckDone} onClick={submit}><Icon name="shield" size={18} />{t.appr_state === 'cho_sua' ? 'Gửi duyệt lại' : 'Gửi duyệt'}</button>
            : <button className="btn primary" disabled={!ckDone} onClick={() => act('next')}><Icon name="check" size={18} />{cur.kind === 'duyet' ? 'Duyệt' : cur.kind === 'kiem_tra' ? 'Đạt, chuyển tiếp' : 'Xong, chuyển tiếp'}</button>}
          {cur.allow_back && t.prev_task && <button className="btn" onClick={() => act('back')}><Icon name="back" size={18} />Trả lại</button>}
          {cur.allow_fail && <button className="btn danger" onClick={() => act('fail')}><Icon name="x" size={18} />Từ chối (Fail)</button>}
        </div>
        {!ckDone && <p className="small muted" style={{ margin: 0 }}>Hoàn thành đủ checklist (tích và tải file) để chuyển bước.</p>}
      </> : inAppr ? null : <p className="small muted" style={{ margin: 0 }}>{unassigned ? 'Chờ người quản trị giai đoạn phân công người làm.' : `Đang chờ ${t.assigned_to ? userName(t.assigned_to, dir) : who(cur.assignee, dir)} xử lý.`}{rights.watch && !rights.manage ? ' Bạn đang theo dõi bước này.' : ''}</p>}
    </section>);
}
