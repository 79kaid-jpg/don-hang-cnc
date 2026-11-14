import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProjectPicker } from '../components/ProjectPicker';
import { useProjects } from '../lib/projects';
import { sb, errText, type Customer, type Profile } from '../lib/supabase';
import { Msg } from '../components/ui';
import { CustomerPicker } from '../components/CustomerPicker';
import { OrderFields } from '../components/OrderFields';
import { useAuth } from '../lib/auth';

export default function NewOrder() {
  const nav = useNavigate(); const [sp] = useSearchParams(); const pjs = useProjects();
  const [cust, setCust] = useState<Customer[]>([]); const [people, setPeople] = useState<Profile[]>([]);
  const { can } = useAuth();
  const [f, setF] = useState({ customer_id: '', project: '', project_id: '', channel: 'Email', contact: '', description: '', quote_due: '', due_date: '', extractor_id: '' });
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.from('customers').select('*').order('code').then(({ data }) => {
      setCust((data as Customer[]) ?? []);
    });
    sb.from('profiles').select('*').eq('active', true).then(({ data }) => setPeople(((data as Profile[]) ?? []).filter((p) => p.roles.includes('ky_thuat'))));
  }, []);
  // Mở từ "Tạo dự án" → chọn sẵn dự án vừa tạo
  useEffect(() => { const id = sp.get('project'); const pj = pjs?.find((x) => x.id === id); if (pj && !f.project_id) setF((x) => ({ ...x, project_id: pj.id, project: pj.name, customer_id: x.customer_id || pj.end_customer_id || '' })); }, [pjs]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const row = { ...f, extra, customer_id: f.customer_id || null, project_id: f.project_id || null, quote_due: f.quote_due || null, due_date: f.due_date || null, extractor_id: f.extractor_id || null };
    const { data, error } = await sb.from('orders').insert(row).select('id').single();
    setBusy(false); if (error) setErr(errText(error)); else nav('/don/' + data.id + '?tab=QT0');
  };
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <div><h1>Bắt đầu QT0 · Bóc tách bản vẽ</h1><p className="muted" style={{ margin: '4px 0 0' }}>Chọn mã dự án, rồi điền thông tin tiếp nhận. Mã đơn nội bộ tự sinh khi lưu.</p></div>
      <div className="card grid2">
        <div className="f f-wide"><span>Mã dự án <b className="req" aria-label="bắt buộc">*</b></span><ProjectPicker value={f.project_id} name={f.project} customerId={f.customer_id}
          onChange={(p) => setF((x) => ({ ...x, project_id: p?.id ?? '', project: p?.name ?? '', customer_id: x.customer_id || p?.end_customer_id || '' }))} /></div>
        <div className="f f-wide"><span>Khách hàng *</span><CustomerPicker value={f.customer_id} list={cust} canCreate={can('kinh_doanh') || can('admin_cnc') || can('admin_it')}
          onCreated={(c) => setCust((x) => [...x, c])} onChange={(c) => setF((x) => ({ ...x, customer_id: c?.id ?? '', contact: x.contact || [c?.contact, c?.phone].filter(Boolean).join(' · ') }))} /></div>
        <OrderFields skip={['project']} vals={f} extra={extra} people={people} onVal={(k, v) => setF((x) => ({ ...x, [k]: v }))} onExtra={(k, v) => setExtra((x) => ({ ...x, [k]: v }))} />
      </div>
      <Msg err={err} />
      <div className="row"><button className="btn primary" disabled={busy || !f.customer_id || !f.project_id}>Lưu và bắt đầu QT0</button><button type="button" className="btn" onClick={() => nav('/don')}>Huỷ</button></div>
    </form>
  );
}
