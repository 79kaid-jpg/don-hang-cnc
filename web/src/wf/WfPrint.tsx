import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';
import { computeRow, fmtDT, loadDirectory, userName, type ApprRow, type Def, type Directory, type Instance, type Task, type Version } from './model';

const fmtN = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : String(v));

/** Bản in A4 của một hồ sơ: tiêu đề, thông tin chung, biểu mẫu (bảng có tổng), bảng ký điện tử, ô ký tay */
export default function WfPrint() {
  const { id } = useParams();
  const [ins, setIns] = useState<Instance | null>(null);
  const [ver, setVer] = useState<(Version & { p: { name: string } }) | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [apprs, setApprs] = useState<ApprRow[]>([]);
  const [order, setOrder] = useState<{ code: string; project: string } | null>(null);
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => {
    (async () => {
      const { data: i } = await sb.from('wf_instances').select('*').eq('id', id).single(); if (!i) return;
      setIns(i as Instance);
      const [v, t, a, o] = await Promise.all([
        sb.from('wf_versions').select('*, p:wf_processes(name)').eq('id', (i as Instance).version_id).single(),
        sb.from('wf_tasks').select('*').eq('instance_id', id).order('created_at'),
        sb.from('wf_approvals').select('*, wf_tasks!inner(instance_id)').eq('wf_tasks.instance_id', id).order('created_at'),
        (i as Instance).order_id ? sb.from('orders').select('code, project').eq('id', (i as Instance).order_id!).single() : Promise.resolve({ data: null })]);
      setVer(v.data as Version & { p: { name: string } }); setTasks((t.data ?? []) as Task[]); setApprs((a.data ?? []) as ApprRow[]); setOrder(o.data as { code: string; project: string } | null);
    })();
    loadDirectory().then(setDir);
  }, [id]);
  if (!ins || !ver) return <Skeleton />;
  const def: Def = ver.def; const pc = def.print ?? {}; const data = (ins.data ?? {}) as Record<string, unknown>;
  const signs = [
    ...tasks.filter((t) => t.status === 'xong').map((t) => ({ what: t.step_name, who: userName(t.done_by, dir), at: t.done_at, note: t.note })),
    ...apprs.filter((a) => a.status === 'dong_y').map((a) => ({ what: (tasks.find((t) => t.id === a.task_id)?.step_name ?? '') + ' · ' + a.level_name, who: userName(a.approver, dir), at: a.decided_at, note: a.note }))
  ].sort((x, y) => String(x.at).localeCompare(String(y.at)));

  return (
    <div className="wf-print-wrap">
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Link to={'/quy-trinh-moi/chay/' + ins.id} className="btn sm"><Icon name="back" size={16} />Về hồ sơ</Link>
        <button className="btn primary" onClick={() => print()}><Icon name="print" size={18} />In / Lưu PDF</button>
      </div>
      <article className="wf-a4">
        <header className="wf-a4-h">
          <div className="small">{pc.subtitle}</div>
          <h1>{(pc.title || ver.p?.name || '').toUpperCase()}</h1>
          <div className="small">Số: <b>{ins.title}</b>{order ? <> · Đơn hàng <b>{order.code}</b>{order.project ? ' · ' + order.project : ''}</> : null} · Ngày lập {fmtDT(ins.started_at)}</div>
          {ins.is_test && <div className="wf-a4-test">BẢN CHẠY THỬ</div>}
        </header>

        <section className="wf-a4-fields">
          {(def.fields ?? []).filter((f) => f.type !== 'table').map((f) => (
            <div key={f.id} className={'wf-a4-row' + (f.type === 'textarea' ? ' full' : '')}><span>{f.label}</span><b>{fmtN(data[f.id]) || ' '}</b></div>))}
        </section>

        {(def.fields ?? []).filter((f) => f.type === 'table').map((f) => {
          const cols = f.columns ?? []; const rows = ((Array.isArray(data[f.id]) ? data[f.id] : []) as Record<string, unknown>[]).map((r) => computeRow(cols, r));
          const sums = cols.map((c) => c.sum ? rows.reduce((a, r) => a + (Number(r[c.id]) || 0), 0) : null);
          return (
            <section key={f.id} className="wf-a4-tbl"><h2>{f.label}</h2>
              <table><thead><tr><th>STT</th>{cols.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}><td className="n">{i + 1}</td>{cols.map((c) => <td key={c.id} className={c.type === 'number' ? 'n' : ''}>{fmtN(r[c.id])}</td>)}</tr>)}
                  {!rows.length && <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center' }}>(không có dòng)</td></tr>}</tbody>
                {sums.some((x) => x != null) && rows.length > 0 && <tfoot><tr><td>Tổng</td>{sums.map((x, k) => <td key={k} className="n">{x == null ? '' : fmtN(Math.round(x * 1000) / 1000)}</td>)}</tr></tfoot>}
              </table></section>);
        })}

        {pc.show_history !== false && signs.length > 0 && <section className="wf-a4-tbl"><h2>Xác nhận điện tử</h2>
          <table><thead><tr><th>Bước</th><th>Người</th><th>Thời gian</th><th>Ý kiến</th></tr></thead>
            <tbody>{signs.map((x, k) => <tr key={k}><td>{x.what}</td><td>{x.who}</td><td>{fmtDT(x.at)}</td><td>{x.note}</td></tr>)}</tbody></table></section>}

        {(pc.hand_signs ?? []).length > 0 && <section className="wf-a4-signs">
          {(pc.hand_signs ?? []).map((x, k) => <div key={k}><b>{x.toUpperCase()}</b><span>(Ký, ghi rõ họ tên)</span></div>)}</section>}
      </article>
    </div>);
}
