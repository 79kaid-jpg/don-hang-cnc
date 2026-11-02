import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb, errText, type Customer, type Profile } from '../lib/supabase';
import { Msg } from '../components/ui';

export default function NewOrder() {
  const nav = useNavigate();
  const [cust, setCust] = useState<Customer[]>([]); const [people, setPeople] = useState<Profile[]>([]);
  const [f, setF] = useState({ kh1_id: '', kh2_id: '', project: '', channel: 'Email', contact: '', description: '', quote_due: '', due_date: '', extractor_id: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.from('customers').select('*').order('code').then(({ data }) => {
      const c = (data as Customer[]) ?? []; setCust(c);
      setF((x) => ({ ...x, kh1_id: c.find((k) => k.code === 'IPC')?.id ?? '', kh2_id: c.find((k) => k.code === 'HANWA')?.id ?? '' }));
    });
    sb.from('profiles').select('*').eq('active', true).then(({ data }) => setPeople(((data as Profile[]) ?? []).filter((p) => p.roles.includes('ky_thuat'))));
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const row = { ...f, kh1_id: f.kh1_id || null, kh2_id: f.kh2_id || null, quote_due: f.quote_due || null, due_date: f.due_date || null, extractor_id: f.extractor_id || null };
    const { data, error } = await sb.from('orders').insert(row).select('id').single();
    setBusy(false); if (error) setErr(errText(error)); else nav('/don/' + data.id);
  };
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <div><h1>Tạo đơn mới · F0 Tiếp nhận</h1><p className="muted" style={{ margin: '4px 0 0' }}>Mã đơn tự sinh khi lưu (ĐH-YYYYMM-NNN).</p></div>
      <div className="card grid2">
        <label className="f">Khách hàng KH1<select value={f.kh1_id} onChange={set('kh1_id')}>{cust.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="f">Khách hàng KH2<select value={f.kh2_id} onChange={set('kh2_id')}><option value="">—</option>{cust.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="f">Dự án *<input required value={f.project} onChange={set('project')} /></label>
        <label className="f">Kênh tiếp nhận<select value={f.channel} onChange={set('channel')}><option>Email</option><option>Điện thoại</option><option>Hệ thống</option></select></label>
        <label className="f">Người liên hệ<input value={f.contact} onChange={set('contact')} placeholder="Tên · số điện thoại" /></label>
        <label className="f">Người bóc tách<select value={f.extractor_id} onChange={set('extractor_id')}><option value="">[chưa giao]</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label className="f">Ngày cần báo giá<input type="date" value={f.quote_due} onChange={set('quote_due')} /></label>
        <label className="f">Ngày cần giao<input type="date" value={f.due_date} onChange={set('due_date')} /></label>
        <label className="f" style={{ gridColumn: '1 / -1' }}>Mô tả yêu cầu<textarea rows={3} value={f.description} onChange={set('description')} /></label>
      </div>
      <Msg err={err} />
      <div className="row"><button className="btn primary" disabled={busy || !cust.length}>Lưu và tạo mã đơn</button><button type="button" className="btn" onClick={() => nav('/don')}>Huỷ</button></div>
    </form>
  );
}
