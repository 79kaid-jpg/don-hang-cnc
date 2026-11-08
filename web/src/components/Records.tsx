import { useEffect, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { recordUrl, type DocRecord } from '../lib/records';
import { COMPANY, PROC_NAME, type Proc } from '../lib/proc';
import { Icon } from './Icon';

const KIND: Record<DocRecord['kind'], [string, string]> = { trinh_duyet: ['Bản trình duyệt', 'wait'], duyet: ['Đã duyệt', 'done'], tu_choi: ['Thất bại', 'bad'] };
const live = (r: DocRecord) => !r.note.startsWith('(đã huỷ');
const fdt = (s: string) => new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Ở bước Duyệt: hiện bản PDF trình duyệt ngay trong phiếu */
export function ReviewPdf({ docId, status }: { docId: string; status: string }) {
  const [r, setR] = useState<DocRecord | null>(null); const [url, setUrl] = useState(''); const [open, setOpen] = useState(true);
  useEffect(() => { sb.from('doc_records').select('*').eq('doc_id', docId).eq('kind', 'trinh_duyet').order('at', { ascending: false }).then(async ({ data }) => {
    const x = ((data as DocRecord[]) ?? []).find(live) ?? null; setR(x); setUrl(x ? await recordUrl(x.path) : ''); }); }, [docId, status]);
  if (!['duyet', 'duyet_them'].includes(status)) return null;
  return (
    <div className="rv">
      <div className="rv-h"><Icon name="file" size={16} /><b>Bản trình duyệt (PDF)</b>
        {r ? <span className="small muted">gửi lúc {fdt(r.at)}</span> : <span className="small muted">chưa có – phiếu gửi duyệt trước khi có chức năng này</span>}
        <span style={{ flex: 1 }} />
        {url && <><a className="btn sm" href={url} target="_blank" rel="noreferrer"><Icon name="share" size={14} />Mở toàn màn hình</a>
          <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Xem'}</button></>}
      </div>
      {url && open && <iframe className="rv-pdf" src={url} title="Bản trình duyệt" />}
      <p className="small muted" style={{ margin: 0 }}>Xem kỹ bản in trước khi bấm <b>Duyệt</b>. Khi duyệt, app lưu bản PDF có dấu “ĐÃ DUYỆT” làm chứng từ.</p>
    </div>);
}

/** Tab Chứng từ của đơn hàng */
export function RecordsTab({ orderId, people }: { orderId: string; people: Record<string, Profile> }) {
  const [list, setList] = useState<DocRecord[] | null>(null); const [f, setF] = useState<'' | 'final'>('final');
  useEffect(() => { sb.from('doc_records').select('*').eq('order_id', orderId).order('at').then(({ data }) => setList(((data as DocRecord[]) ?? []).filter(live))); }, [orderId]);
  const open = async (p: string) => { const u = await recordUrl(p); if (u) window.open(u, '_blank'); };
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
          <li key={r.id}><button className="rc-it" onClick={() => open(r.path)}>
            <span className={'chip ' + cls}>{r.result === 'thanh_cong' ? 'Thành công' : lb}</span>
            <span className="rc-t"><b>{r.batch_title} · {g.p === 'QT0' ? 'Phương Nam CNC' : COMPANY[r.company as keyof typeof COMPANY] ?? r.company}</b>
              <span className="small muted">{[r.level_name && r.kind === 'duyet' ? r.level_name : '', people[r.by_user ?? '']?.full_name, fdt(r.at), r.note].filter(Boolean).join(' · ')}</span></span>
            <Icon name="download" size={16} /></button></li>); })}</ul></div>)}
    </section>);
}
