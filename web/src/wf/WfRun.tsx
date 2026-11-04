import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { Msg, Skeleton, confirmDialog, toast } from '../components/ui';
import { ISTATUS, KIND, TSTATUS, fmtDT, loadDirectory, slaLeft, userName, who,
  type Def, type Directory, type Instance, type Step, type Task, type Version } from './model';

type Ev = { id: number; action: string; detail: string; actor: string; real_actor: string; at: string };

export default function WfRun() {
  const { id } = useParams();
  const { me, can } = useAuth();
  const [ins, setIns] = useState<Instance | null>(null);
  const [ver, setVer] = useState<(Version & { p: { name: string } }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [dir, setDir] = useState<Directory | null>(null);
  const [mineOk, setMineOk] = useState(false);
  const [ck, setCk] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    const i = await sb.from('wf_instances').select('*').eq('id', id).single();
    if (i.error) return setErr(errText(i.error));
    const inst = i.data as Instance; setIns(inst);
    const [v, t, e, m] = await Promise.all([
      sb.from('wf_versions').select('*, p:wf_processes(name)').eq('id', inst.version_id).single(),
      sb.from('wf_tasks').select('*').eq('instance_id', id).order('created_at'),
      sb.from('wf_events').select('*').eq('instance_id', id).order('id'),
      sb.rpc('wf_my_tasks')]);
    setVer(v.data as Version & { p: { name: string } }); setTasks((t.data ?? []) as Task[]); setEvs((e.data ?? []) as Ev[]);
    setMineOk(((m.data ?? []) as { instance_id: string }[]).some((x) => x.instance_id === id));
    setCk({}); setNote('');
  };
  useEffect(() => { load(); loadDirectory().then(setDir); }, [id]);

  if (!ins || !ver) return err ? <Msg err={err} /> : <Skeleton />;
  const def: Def = ver.def; const cur: Step | undefined = def.steps[ins.step_idx];
  const open = tasks.find((t) => t.status === 'cho');
  const canAct = ins.status === 'dang_chay' && !!open && mineOk;

  const act = async (action: 'next' | 'back' | 'fail') => {
    if (!open) return;
    if (action !== 'next' && !note.trim()) return setErr(action === 'back' ? 'Ghi lý do trả lại' : 'Ghi lý do từ chối');
    if (action === 'fail' && !(await confirmDialog('Từ chối và dừng quy trình (Fail)? Không thể tiếp tục lượt chạy này.', 'Fail'))) return;
    const { data, error } = await sb.rpc('wf_act', { p_task: open.id, p_action: action, p_note: note, p_checklist: ck });
    if (error) return setErr(errText(error));
    setErr(''); toast(action === 'next' ? (data === 'hoan_tat' ? 'Hoàn tất quy trình' : 'Đã chuyển: ' + data) : action === 'back' ? 'Đã trả lại' : 'Đã Fail');
    load();
  };
  const cancel = async () => {
    const r = prompt('Lý do huỷ lượt chạy'); if (!r) return;
    const { error } = await sb.rpc('wf_cancel', { p_inst: ins.id, p_note: r });
    if (error) return setErr(errText(error)); toast('Đã huỷ'); load();
  };
  const ckDone = (cur?.checklist ?? []).every((c) => ck[c]);
  const sla = open && slaLeft(open.due_at);

  return (
    <div className="wf" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-head">
        <div><Link to="/quy-trinh-moi" className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="back" size={14} />Trình tạo quy trình</Link>
          <h1>{ins.title}</h1>
          <div className="row small muted"><span>{ver.p?.name} · bản {ver.version}</span>
            <span className={'chip ' + ({ dang_chay: 'wait', hoan_tat: 'done', fail: 'bad', huy: 'idle' }[ins.status])}>{ISTATUS[ins.status]}</span>
            {ins.is_test && <span className="chip idle">Chạy thử</span>}</div></div>
        {ins.status === 'dang_chay' && (can('admin_it') || ins.started_by === me?.id) && <button className="btn sm danger" onClick={cancel}>Huỷ lượt chạy</button>}
      </div>
      <Msg err={err} />

      {/* Thanh tiến trình */}
      <ol className="wf-progress" aria-label="Tiến trình">
        {def.steps.map((s, i) => (
          <li key={s.id} className={i < ins.step_idx ? 'done' : i === ins.step_idx && ins.status === 'dang_chay' ? 'cur' : ins.status === 'fail' && i === ins.step_idx ? 'bad' : ''}
            aria-current={i === ins.step_idx ? 'step' : undefined}><span>{i + 1}</span><em>{s.name}</em></li>))}
      </ol>

      {/* Việc hiện tại */}
      {ins.status === 'dang_chay' && cur && (
        <section className="card wf-now" aria-label="Bước hiện tại">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><span className={'wf-kind ' + KIND[cur.kind].c}>{KIND[cur.kind].t}</span> <b style={{ fontSize: 18 }}>{cur.name}</b>
              <div className="small muted">Người làm: {who(cur.assignee, dir)}</div></div>
            {sla && <span className={'chip ' + (sla.late ? 'bad' : 'wait')}><Icon name="clock" size={13} />{sla.text}</span>}
          </div>
          {cur.guide && <p className="small" style={{ margin: 0 }}>{cur.guide}</p>}
          {canAct ? <>
            {!!cur.checklist?.length && <div className="wf-toggles" role="group" aria-label="Checklist">
              {cur.checklist.map((c) => <label key={c}><input type="checkbox" checked={!!ck[c]} onChange={(e) => setCk({ ...ck, [c]: e.target.checked })} />{c}</label>)}</div>}
            <label className="f"><span>Ghi chú{cur.require_note ? ' (bắt buộc)' : ''}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ý kiến, lý do trả lại / từ chối…" /></label>
            <div className="row wf-actions">
              <button className="btn primary" disabled={!ckDone} onClick={() => act('next')}><Icon name="check" size={18} />{cur.kind === 'duyet' ? 'Duyệt' : cur.kind === 'kiem_tra' ? 'Đạt, chuyển tiếp' : 'Xong, chuyển tiếp'}</button>
              {cur.allow_back && ins.step_idx > 0 && <button className="btn" onClick={() => act('back')}><Icon name="back" size={18} />Trả lại</button>}
              {cur.allow_fail && <button className="btn danger" onClick={() => act('fail')}><Icon name="x" size={18} />Từ chối (Fail)</button>}
            </div>
            {!ckDone && <p className="small muted" style={{ margin: 0 }}>Tích đủ checklist để chuyển bước.</p>}
          </> : <p className="small muted" style={{ margin: 0 }}>Đang chờ {who(cur.assignee, dir)} xử lý.{can('admin_it') ? ' Dùng “Đăng nhập với tư cách” ở Quản trị để thử vai người này.' : ''}</p>}
        </section>)}

      {/* Lịch sử */}
      <section className="card" aria-label="Lịch sử">
        <b>Lịch sử xử lý</b>
        <ol className="wf-log">
          {tasks.map((t) => (
            <li key={t.id} className={'t-' + t.status}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{t.step_name}</b><span className="small muted">{TSTATUS[t.status]}</span></div>
              <div className="small muted">Mở {fmtDT(t.created_at)}{t.done_at ? ` · xử lý ${fmtDT(t.done_at)} bởi ${userName(t.done_by, dir)}` : ''}</div>
              {t.note && <div className="small">“{t.note}”</div>}
            </li>))}
        </ol>
        <details><summary className="small muted">Nhật ký chi tiết ({evs.length})</summary>
          <ul className="small">{evs.map((e) => <li key={e.id}>{fmtDT(e.at)} · {userName(e.actor, dir)}{e.real_actor && e.real_actor !== e.actor ? ` (IT ${userName(e.real_actor, dir)} đóng vai)` : ''}: {e.detail}</li>)}</ul></details>
      </section>
    </div>
  );
}
