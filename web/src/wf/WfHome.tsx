import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { Empty, Msg, Skeleton, toast } from '../components/ui';
import { ISTATUS, VAI, VSTATUS, fmtDT, slaLeft, type Instance, type MyTask, type Process, type Version } from './model';

type Row = Process & { versions: Version[] };
type Tab = 'viec' | 'quy_trinh' | 'mau' | 'luot';

export default function WfHome() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('viec');
  const [list, setList] = useState<Row[] | null>(null);
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [runs, setRuns] = useState<(Instance & { pname: string })[] | null>(null);
  const [err, setErr] = useState('');
  const load = async () => {
    const [p, t, i] = await Promise.all([
      sb.from('wf_processes').select('*, versions:wf_versions(id, process_id, version, status, updated_at, published_at, def)').order('created_at', { ascending: false }),
      sb.rpc('wf_inbox'),
      sb.from('wf_instances').select('*, v:wf_versions(p:wf_processes(name))').order('started_at', { ascending: false }).limit(50)
    ]);
    setList((p.data ?? []) as Row[]); setTasks((t.data ?? []) as MyTask[]);
    setRuns(((i.data ?? []) as (Instance & { v: { p: { name: string } } })[]).map((x) => ({ ...x, pname: x.v?.p?.name ?? '' })));
  };
  useEffect(() => { load(); }, []);

  const create = async (from?: Version, name?: string) => {
    const n = name ?? prompt('Tên quy trình mới', from ? '' : 'Quy trình mới');
    if (!n) return;
    const { data, error } = await sb.rpc('wf_process_create', { p_name: n, p_from_version: from?.id ?? null });
    if (error) return setErr(errText(error));
    toast(from ? 'Đã nhân bản mẫu' : 'Đã tạo quy trình'); nav('/quy-trinh-moi/sua/' + data);
  };
  const latest = (r: Row) => [...r.versions].sort((a, b) => b.version - a.version)[0];
  const live = (r: Row) => r.versions.find((v) => v.status === 'phat_hanh');
  const mine = (list ?? []).filter((r) => !r.is_template);
  const tpl = (list ?? []).filter((r) => r.is_template);

  const tabs: [Tab, string, number?][] = [['viec', 'Việc của tôi', tasks?.filter((t) => t.vai === 'lam' || t.vai === 'phan_cong' || t.vai === 'duyet').length], ['quy_trinh', 'Quy trình', mine.length], ['mau', 'Thư viện mẫu', tpl.length], ['luot', 'Lượt chạy']];
  return (
    <div className="wf" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-head">
        <div><h1>Trình tạo quy trình <span className="chip wait">Thử nghiệm</span></h1>
          <p className="muted">Tự thiết kế quy trình: bước, người làm, hạn xử lý, checklist. Tách riêng, không ảnh hưởng quy trình đơn hàng đang chạy.</p></div>
        {can('admin_it') && <button className="btn primary" onClick={() => create()}><Icon name="plus" size={18} />Quy trình mới</button>}
      </div>
      <Msg err={err} />
      <div className="wf-tabs" role="tablist">
        {tabs.map(([k, t, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}{n ? <span className="nav-badge">{n}</span> : null}</button>)}
      </div>

      {tab === 'viec' && (!tasks ? <Skeleton /> : !tasks.length ? <Empty title="Không có việc nào đang chờ bạn" /> :
        <div className="steps">{tasks.map((t) => { const s = slaLeft(t.due_at); return (
          <Link key={t.task_id + t.vai + t.step_name} to={'/quy-trinh-moi/chay/' + t.instance_id} className="card wf-item">
            <div style={{ flex: 1, minWidth: 0 }}><b>{t.step_name}</b><span className={'chip ' + (t.vai === 'phan_cong' ? 'bad' : t.vai === 'lam' || t.vai === 'duyet' ? 'wait' : 'idle')} style={{ marginLeft: 8 }}>{VAI[t.vai]}</span>{t.is_test && <span className="chip idle" style={{ marginLeft: 8 }}>Chạy thử</span>}
              <div className="small muted">{t.process_name} · {t.title}</div></div>
            {s && <span className={'chip ' + (s.late ? 'bad' : 'wait')}><Icon name="clock" size={13} />{s.text}</span>}
            <Icon name="arrow" size={18} />
          </Link>); })}</div>)}

      {tab === 'quy_trinh' && (!list ? <Skeleton /> : !mine.length ? <Empty title="Chưa có quy trình nào">
        <p className="muted small">Bắt đầu từ Thư viện mẫu (nhân bản QT0, QT1…) hoặc tạo mới.</p>
        <button className="btn sm" onClick={() => setTab('mau')}>Xem thư viện mẫu</button></Empty> :
        <div className="steps">{mine.map((r) => { const v = latest(r), l = live(r); return (
          <div key={r.id} className="card wf-item">
            <div style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b>
              <div className="small muted">{v.def.steps.length} bước · {v.def.lanes.length} làn · bản {v.version}: {VSTATUS[v.status]}{l && l.id !== v.id ? ` (đang chạy bản ${l.version})` : ''} · sửa {fmtDT(v.updated_at)}</div></div>
            <span className={'chip ' + (l ? 'done' : 'idle')}>{l ? 'Đã phát hành' : 'Nháp'}</span>
            <Link className="btn sm" to={'/quy-trinh-moi/sua/' + r.id}><Icon name="settings" size={16} />Thiết kế</Link>
          </div>); })}</div>)}

      {tab === 'mau' && (!list ? <Skeleton /> :
        <div className="wf-grid">{tpl.map((r) => { const v = latest(r); return (
          <div key={r.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="small muted">{r.category}</span><b>{r.name}</b><p className="small muted" style={{ margin: 0 }}>{r.description}</p>
            <ol className="wf-mini">{v.def.steps.map((s) => <li key={s.id}>{s.name}</li>)}</ol>
            <div className="row" style={{ marginTop: 'auto' }}>
              <Link className="btn sm" to={'/quy-trinh-moi/sua/' + r.id}><Icon name="eye" size={16} />Xem</Link>
              {can('admin_it') && <button className="btn sm primary" onClick={() => create(v, r.name.replace(/^(QT\d) · /, '$1 (bản mới) · '))}><Icon name="plus" size={16} />Nhân bản để sửa</button>}
            </div>
          </div>); })}</div>)}

      {tab === 'luot' && (!runs ? <Skeleton /> : !runs.length ? <Empty title="Chưa có lượt chạy nào" /> :
        <div className="card flush"><table className="wf-table"><thead><tr><th>Lượt chạy</th><th>Quy trình</th><th>Trạng thái</th><th>Bắt đầu</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id} onClick={() => nav('/quy-trinh-moi/chay/' + r.id)} style={{ cursor: 'pointer' }}>
              <td><Link to={'/quy-trinh-moi/chay/' + r.id}>{r.title}</Link>{r.is_test && <span className="chip idle" style={{ marginLeft: 6 }}>Thử</span>}</td>
              <td>{r.pname}</td><td><span className={'chip ' + ({ dang_chay: 'wait', hoan_tat: 'done', fail: 'bad', huy: 'idle' }[r.status])}>{ISTATUS[r.status]}</span></td><td>{fmtDT(r.started_at)}</td>
            </tr>))}</tbody></table></div>)}
    </div>
  );
}
