import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, type Profile } from '../lib/supabase';
import { recordUrl, type DocRecord } from '../lib/records';
import { COMPANY, PROC_NAME, type Proc } from '../lib/proc';
import { Icon } from './Icon';
import { viewUrl } from '../lib/viewer';

const KIND: Record<DocRecord['kind'], [string, string]> = { trinh_duyet: ['Bản trình duyệt', 'wait'], duyet: ['Đã duyệt', 'done'], tu_choi: ['Thất bại', 'bad'] };
const live = (r: DocRecord) => !r.note.startsWith('(đã huỷ');
const fdt = (s: string) => new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Ở bước Duyệt: hiện bản PDF trình duyệt ngay trong phiếu */
export function ReviewPdf({ docId, status }: { docId: string; status: string }) {
  const [r, setR] = useState<DocRecord | null>(null); const [url, setUrl] = useState('');
  useEffect(() => { sb.from('doc_records').select('*').eq('doc_id', docId).eq('kind', 'trinh_duyet').order('at', { ascending: false }).then(async ({ data }) => {
    const x = ((data as DocRecord[]) ?? []).find(live) ?? null; setR(x); setUrl(x ? await recordUrl(x.path) : ''); }); }, [docId, status]);
  if (!['duyet', 'duyet_them'].includes(status)) return null;
  return (
    <div className="rv rv-mini">
      <Icon name="file" size={16} /><b>Bản trình duyệt</b>
      <span className="small muted rv-at">{r ? new Date(r.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'chưa có'}</span>
      {url && <button className="btn sm rv-go" onClick={() => viewUrl(url, 'Ban-trinh-duyet.pdf')}><Icon name="eye" size={15} />Xem</button>}
    </div>);
}

/** Tab Chứng từ của đơn hàng */
export function RecordsTab({ orderId, people }: { orderId: string; people: Record<string, Profile> }) {
  const [list, setList] = useState<DocRecord[] | null>(null); const [f, setF] = useState<'' | 'final'>('final');
  useEffect(() => { sb.from('doc_records').select('*').eq('order_id', orderId).order('at').then(({ data }) => setList(((data as DocRecord[]) ?? []).filter(live))); }, [orderId]);
  const nav = useNavigate(); const [urls, setUrls] = useState<Record<string, string>>({}); const [view, setView] = useState<DocRecord | null>(null);
  // Tạo sẵn link ký (mở/tải ngay khi bấm – Safari/iPad chặn cửa sổ mở sau khi chờ)
  useEffect(() => { if (!list?.length) return; sb.storage.from('files').createSignedUrls(list.map((r) => r.path), 3600)
    .then(({ data }) => setUrls(Object.fromEntries((data ?? []).map((x, i) => [list[i].path, x.signedUrl ?? ''])))); }, [list]);
  const goDoc = (r: DocRecord) => { nav('/don/' + r.order_id + '?tab=' + r.proc); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  if (!list) return <p className="muted">Đang tải…</p>;
  const rows = list.filter((r) => !f || r.kind !== 'trinh_duyet');
  const groups = (['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => ({ p, rs: rows.filter((r) => r.proc === p) })).filter((g) => g.rs.length);
  return (
    <section className="card rc">
      <div className="rc-top"><div><h2 style={{ margin: 0 }}>Chứng từ</h2><p className="small muted" style={{ margin: '2px 0 0' }}>Bản PDF lưu cố định khi gửi duyệt, khi mỗi cấp duyệt và khi thất bại. Không sửa được.</p></div>
        <div className="ap-seg" role="radiogroup" aria-label="Lọc"><button role="radio" aria-checked={f === 'final'} className={f === 'final' ? 'on' : ''} onClick={() => setF('final')}>Đã duyệt / thất bại</button>
          <button role="radio" aria-checked={f === ''} className={f === '' ? 'on' : ''} onClick={() => setF('')}>Tất cả</button></div></div>
      {!groups.length && <p className="muted">Chưa có chứng từ. Chứng từ được tạo khi phiếu được gửi duyệt hoặc được duyệt.</p>}
      {groups.map((g) => <div key={g.p} className="rc-g"><h3>{g.p} · {PROC_NAME[g.p]}</h3>
        <ul className="rc-list">{g.rs.map((r) => { const [lb, cls] = KIND[r.kind]; return (
          <li key={r.id} className="rc-row"><button className="rc-it" title="Mở hồ sơ ở quy trình này" onClick={() => goDoc(r)}>
            <span className={'chip ' + cls}>{r.result === 'thanh_cong' ? 'Thành công' : lb}</span>
            <span className="rc-t"><b>{r.batch_title} · {g.p === 'QT0' ? 'Phương Nam CNC' : COMPANY[r.company as keyof typeof COMPANY] ?? r.company}</b>
              <span className="small muted">{[r.level_name && r.kind === 'duyet' ? r.level_name : '', people[r.by_user ?? '']?.full_name, fdt(r.at), r.note].filter(Boolean).join(' · ')}</span></span>
            </button>
            <button className="btn xs" disabled={!urls[r.path]} onClick={() => setView(r)}><Icon name="eye" size={13} />Xem</button>
            <a className={'btn xs icon-only' + (urls[r.path] ? '' : ' disabled')} href={urls[r.path] ? urls[r.path] + '&download=' + encodeURIComponent((r.batch_title || r.proc) + '-' + r.kind + '.pdf') : undefined} aria-label="Tải PDF" title="Tải PDF"><Icon name="download" size={13} /></a></li>); })}</ul></div>)}
      {view && createPortal(<div className="modal-bg" onClick={() => setView(null)}><div className="modal rc-view" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mv-head"><b>{view.proc} · {view.batch_title} · {KIND[view.kind][0]}</b><span className="row" style={{ gap: 6 }}>
          <a className="btn xs" href={urls[view.path]} target="_blank" rel="noreferrer"><Icon name="download" size={13} />Mở tab mới</a>
          <button className="btn xs" onClick={() => { setView(null); goDoc(view); }}>Mở hồ sơ</button>
          <button className="btn xs icon-only" aria-label="Đóng" onClick={() => setView(null)}><Icon name="x" size={14} /></button></span></div>
        <iframe className="rc-frame" src={urls[view.path]} title="Chứng từ" /></div></div>, document.body)}
    </section>);
}
