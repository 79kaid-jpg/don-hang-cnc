import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { toast } from './ui';
import { useAuth } from '../lib/auth';

/** Đánh giá chất lượng khi duyệt – riêng tư: chỉ người được đánh giá, người đánh giá và Admin IT thấy. Không gửi vào nhóm. */
export const RATE_TAGS = { good: ['Đúng hạn', 'Số liệu chính xác', 'Đủ chứng từ', 'Trình bày rõ ràng'], bad: ['Cần cẩn thận hơn', 'Thiếu chứng từ', 'Chậm'] };
const ROLE_NAME: Record<string, string> = { lap: 'Lập', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', admin: 'Tiếp nhận / tạo DS tấm', ky_thuat: 'Bóc tách kỹ thuật' };
const STAR_TXT = ['', 'Cần cải thiện', 'Chưa đạt', 'Đạt', 'Tốt', 'Rất tốt'];
type Target = { user_id: string; role: string; mine: number | null; tags: string[] | null; comment: string | null; editable: boolean };
type Draft = { stars: number; tags: string[]; comment: string; open: boolean };

/** Gọi sau khi ký Duyệt / cấp duyệt thêm thành công */
export const askRating = (docId: string, title: string) => dispatchEvent(new CustomEvent('ask-rating', { detail: { docId, title } }));

export function Stars({ value, onChange, size = 30, label }: { value: number; onChange?: (n: number) => void; size?: number; label: string }) {
  return <div className="rt-stars" role={onChange ? 'radiogroup' : 'img'} aria-label={label + (onChange ? '' : `: ${value}/5 sao`)}>
    {[1, 2, 3, 4, 5].map((n) => { const s = <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" className={n <= value ? 'on' : ''} /></svg>;
      return onChange ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={n + ' sao'} onClick={() => onChange(n === value ? 0 : n)}>{s}</button> : <span key={n}>{s}</span>; })}</div>;
}

export function RatingHost() {
  const [req, setReq] = useState<{ docId: string; title: string } | null>(null);
  const [ts, setTs] = useState<Target[] | null>(null); const [dr, setDr] = useState<Record<string, Draft>>({});
  const [names, setNames] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { const f = (e: Event) => setReq((e as CustomEvent).detail); addEventListener('ask-rating', f); return () => removeEventListener('ask-rating', f); }, []);
  useEffect(() => { if (!req) return; setTs(null);
    sb.rpc('rating_targets', { p_doc: req.docId }).then(async ({ data }) => { const l = ((data ?? []) as Target[]).filter((x) => x.editable);
      if (!l.length) { setReq(null); return; }
      const { data: p } = await sb.from('profiles').select('id, full_name').in('id', l.map((x) => x.user_id));
      setNames(Object.fromEntries(((p ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])));
      setDr(Object.fromEntries(l.map((x, i) => [x.user_id, { stars: x.mine ?? 0, tags: x.tags ?? [], comment: x.comment ?? '', open: i === 0 || !!x.mine }])));
      setTs(l); }); }, [req]);
  if (!req || !ts) return null;
  const set = (id: string, p: Partial<Draft>) => setDr({ ...dr, [id]: { ...dr[id], ...p } });
  const n = Object.values(dr).filter((x) => x.stars > 0).length;
  const send = async () => { setBusy(true);
    const { error } = await sb.rpc('rating_save', { p_doc: req.docId, p_items: Object.entries(dr).filter(([, x]) => x.stars > 0).map(([id, x]) => ({ ratee: id, stars: x.stars, tags: x.tags, comment: x.comment.trim() })) });
    setBusy(false); if (error) return toast(errText(error)); toast('Đã gửi đánh giá riêng cho ' + n + ' người'); setReq(null); };
  return <Sheet label="Đánh giá chất lượng" head={<b>Đánh giá chất lượng</b>} sub={req.title + ' · không bắt buộc · chỉ người được đánh giá và Admin thấy, không gửi vào nhóm'} onClose={() => setReq(null)}>
    <div className="rt-list">{ts.map((t) => { const x = dr[t.user_id]; const nm = names[t.user_id] ?? '…';
      return <section key={t.user_id} className="rt-card">
        <div className="rt-who"><span className="rt-av" aria-hidden="true">{nm.trim().split(' ').pop()?.[0]}</span><span><b>{nm}</b><small>{ROLE_NAME[t.role] ?? t.role}</small></span>
          <em className={x.stars ? 'on' : ''}>{x.stars ? STAR_TXT[x.stars] : 'Chưa đánh giá'}</em></div>
        <Stars value={x.stars} onChange={(v) => set(t.user_id, { stars: v, open: true })} label={'Đánh giá ' + nm} />
        {x.open && x.stars > 0 && <>
          <div className="rt-tags">{[...RATE_TAGS.good, ...RATE_TAGS.bad].map((g) => { const on = x.tags.includes(g);
            return <button key={g} type="button" aria-pressed={on} className={RATE_TAGS.bad.includes(g) ? 'bad' : ''} onClick={() => set(t.user_id, { tags: on ? x.tags.filter((y) => y !== g) : [...x.tags, g] })}>{g}</button>; })}</div>
          <label className="rt-cm"><span>Góp ý riêng cho {nm.split(' ').pop()}</span>
            <textarea value={x.comment} maxLength={1000} placeholder="Không bắt buộc" onChange={(e) => set(t.user_id, { comment: e.target.value })} /></label></>}
      </section>; })}</div>
    <div className="rt-foot">
      <button className="btn" onClick={() => setReq(null)}>Bỏ qua</button>
      <button className="btn primary" disabled={!n || busy} onClick={send}>{busy ? 'Đang gửi…' : n ? `Gửi đánh giá (${n})` : 'Chọn số sao để gửi'}</button>
    </div>
    <p className="small muted rt-note">Gửi riêng qua app và Zalo cá nhân (nếu đã liên kết). Sửa được trong 24 giờ.</p>
  </Sheet>;
}

type R = { id: string; doc_id: string; rater: string; stars: number; tags: string[]; comment: string; ack_at: string | null; created_at: string };
type Ctx = { id: string; proc: string; title: string; order_id: string; code: string };

/** Trang "Phản hồi cho tôi" */
export default function MyRatings() {
  const { me: who } = useAuth(); const meId = who?.id;
  const [rs, setRs] = useState<R[] | null>(null); const [names, setNames] = useState<Record<string, string>>({}); const [ctx, setCtx] = useState<Record<string, Ctx>>({});
  const load = async () => {
    if (!meId) return; const me = meId;
    const { data } = await sb.from('ratings').select('id, doc_id, rater, stars, tags, comment, ack_at, created_at').eq('ratee', me).order('created_at', { ascending: false }).limit(200);
    const l = (data ?? []) as R[]; setRs(l); if (!l.length) return;
    const [p, d] = await Promise.all([sb.from('profiles').select('id, full_name').in('id', [...new Set(l.map((x) => x.rater))]),
      sb.from('docs_v').select('id, header, batch_id').in('id', [...new Set(l.map((x) => x.doc_id))])]);
    setNames(Object.fromEntries(((p.data ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])));
    const ds = (d.data ?? []) as { id: string; header: Record<string, string>; batch_id: string }[];
    const { data: bs } = await sb.from('batches').select('id, proc, title, order_id').in('id', ds.map((x) => x.batch_id));
    const bm = Object.fromEntries(((bs ?? []) as { id: string; proc: string; title: string; order_id: string }[]).map((b) => [b.id, b]));
    setCtx(Object.fromEntries(ds.map((x) => { const b = bm[x.batch_id]; return [x.id, { id: x.id, proc: b?.proc ?? '', title: b?.title ?? '', order_id: b?.order_id ?? '', code: x.header?.so_xn ?? '' }]; })));
  };
  useEffect(() => { load(); }, [meId]); // eslint-disable-line react-hooks/exhaustive-deps
  const ack = async (id: string) => { const { error } = await sb.rpc('rating_ack', { p_id: id }); if (error) toast(errText(error)); else setRs((l) => l && l.map((x) => x.id === id ? { ...x, ack_at: new Date().toISOString() } : x)); };
  const recent = (rs ?? []).filter((x) => Date.now() - +new Date(x.created_at) < 30 * 864e5);
  const avg = recent.length ? recent.reduce((a, x) => a + x.stars, 0) / recent.length : 0;
  const tc: Record<string, number> = {}; for (const x of recent) for (const t of x.tags) tc[t] = (tc[t] ?? 0) + 1;
  return <div className="rt-page">
    <div className="page-head"><div><h1>Phản hồi cho tôi</h1><p className="muted"><Icon name="shield" size={14} /> Chỉ bạn và Admin thấy trang này. Đồng nghiệp và nhóm Zalo không thấy.</p></div></div>
    {!rs ? <p className="muted">Đang tải…</p> : !rs.length ? <div className="card rt-empty"><Stars value={0} label="Chưa có đánh giá" size={28} /><p>Chưa có đánh giá nào. Khi người duyệt đánh giá phiếu bạn làm, phản hồi sẽ hiện ở đây.</p></div> : <>
      <section className="card rt-sum"><b className="rt-avg">{recent.length ? avg.toFixed(1).replace('.', ',') : '–'}</b>
        <div><Stars value={Math.round(avg)} label="Trung bình 30 ngày" size={20} /><span className="small muted">Trung bình 30 ngày · {recent.length} lượt</span></div>
        {Object.keys(tc).length > 0 && <div className="rt-tc">{Object.entries(tc).sort((a, z) => z[1] - a[1]).map(([t, n]) =>
          <span key={t} className={RATE_TAGS.bad.includes(t) ? 'bad' : ''}>{t} ×{n}</span>)}</div>}</section>
      <ul className="rt-feed">{rs.map((x) => { const c = ctx[x.doc_id];
        return <li key={x.id} className={'card' + (x.ack_at ? '' : ' new')}>
          <div className="rt-fh"><Stars value={x.stars} label="Số sao" size={18} /><span className="small muted">{new Date(x.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
          <div><b>{names[x.rater] ?? '…'}</b> đánh giá {c ? <Link to={'/don/' + c.order_id + '?tab=' + c.proc}>{c.proc} · {c.code || c.title}</Link> : '…'}</div>
          {x.tags.length > 0 && <div className="rt-tc">{x.tags.map((t) => <span key={t} className={RATE_TAGS.bad.includes(t) ? 'bad' : ''}>{t}</span>)}</div>}
          {x.comment && <p className="rt-cmt">{x.comment}</p>}
          {!x.ack_at ? <button className="btn sm" onClick={() => ack(x.id)}><Icon name="check" size={14} />Đã hiểu, cảm ơn</button> : <span className="small muted">Đã xem</span>}
        </li>; })}</ul></>}
  </div>;
}
