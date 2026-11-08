import { useEffect, useState } from 'react';
import { sb, errText, type Customer } from '../lib/supabase';
import { CustomerForm } from './CustomerPicker';
import { Icon } from './Icon';
import { toast } from './ui';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Quản trị → Khách hàng: danh mục dùng chung (IPC, Hanwa, khách cuối…) */
export function CustomersAdmin({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<Customer[]>([]); const [n, setN] = useState<Record<string, number>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [q, setQ] = useState(''); const [ed, setEd] = useState<Partial<Customer> | null>(null); const [off, setOff] = useState(false);
  const load = () => {
    sb.from('customers').select('*').order('name').then(async ({ data }) => { const l = (data as Customer[]) ?? []; setList(l);
      const ps = l.map((c) => c.logo_path).filter(Boolean) as string[];
      if (ps.length) { const { data: u } = await sb.storage.from('files').createSignedUrls(ps, 3600); setLogos(Object.fromEntries((u ?? []).map((x, i) => [ps[i], x.signedUrl ?? '']))); } });
    sb.from('orders').select('customer_id').then(({ data }) => { const m: Record<string, number> = {}; for (const r of (data as { customer_id: string | null }[]) ?? []) if (r.customer_id) m[r.customer_id] = (m[r.customer_id] ?? 0) + 1; setN(m); });
  };
  useEffect(load, []);
  const t = norm(q.trim());
  const rows = list.filter((c) => (off || c.active !== false) && (!t || norm([c.name, c.code, c.tax_code, c.phone, c.contact].filter(Boolean).join(' ')).includes(t)));
  const toggle = async (c: Customer) => { const { error } = await sb.from('customers').update({ active: c.active === false }).eq('id', c.id);
    if (error) toast(errText(error)); else { toast(c.active === false ? 'Đã bật lại ' + c.name : 'Đã ẩn ' + c.name); load(); } };
  return (
    <div className="ca">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, mã, MST, SĐT…" aria-label="Tìm khách hàng" />
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />Hiện khách đã ẩn</label>
        {canEdit && <button className="btn primary" onClick={() => setEd({})}><Icon name="plus" size={18} />Khách hàng mới</button>}
      </div>
      <div className="tbl-wrap card" style={{ padding: 0 }}><table className="tbl">
        <thead><tr><th>Khách hàng</th><th>Mã</th><th>MST</th><th>Liên hệ</th><th className="n">Số đơn</th><th /></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id} style={c.active === false ? { opacity: .5 } : undefined}>
          <td><span className="ca-nm"><span className="ca-logo">{c.logo_path && logos[c.logo_path] ? <img src={logos[c.logo_path]} alt="" /> : <span>{c.code.slice(0, 3)}</span>}</span><span><b>{c.name}</b>{c.address && <div className="small muted">{c.address}</div>}</span></span></td><td>{c.code}</td><td>{c.tax_code ?? ''}</td>
          <td className="small">{[c.contact, c.phone, c.email].filter(Boolean).join(' · ')}</td><td className="n">{n[c.id] ?? 0}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit && <><button className="btn sm" onClick={() => setEd(c)}>Sửa</button> <button className="btn sm" onClick={() => toggle(c)}>{c.active === false ? 'Bật lại' : 'Ẩn'}</button></>}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">Không có khách hàng phù hợp.</td></tr>}</tbody></table></div>
      {ed && <CustomerForm init={ed} list={list} onClose={() => setEd(null)} onSaved={(c) => { setEd(null); toast('Đã lưu ' + c.name); load(); }} />}
    </div>);
}
