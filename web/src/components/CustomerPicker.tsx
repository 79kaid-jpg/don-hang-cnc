import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, errText, type Customer } from '../lib/supabase';
import { Icon } from './Icon';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const codeOf = (name: string) => norm(name).split(/[^a-z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 8) || 'KH';

/** Ô chọn khách hàng: gõ để tìm (tên, mã, MST, điện thoại); không có thì tạo mới ngay */
export function CustomerPicker({ value, onChange, list, onCreated, canCreate = true, autoFocus }: {
  value: string; onChange: (c: Customer | null) => void; list: Customer[]; onCreated?: (c: Customer) => void; canCreate?: boolean; autoFocus?: boolean }) {
  const cur = list.find((c) => c.id === value) ?? null;
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0); const [create, setCreate] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => { const t = norm(q.trim()); const act = list.filter((c) => c.active !== false && c.kind !== 'van_chuyen');
    return (t ? act.filter((c) => norm([c.name, c.code, c.tax_code, c.phone, c.contact].filter(Boolean).join(' ')).includes(t)) : act).slice(0, 8); }, [q, list]);
  useEffect(() => { const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, []);
  const pick = (c: Customer) => { onChange(c); setQ(''); setOpen(false); };
  const n = hits.length + (canCreate && q.trim() ? 1 : 0);
  return (
    <div className="cp" ref={box}>
      {cur && !open ? <button type="button" className="cp-cur" onClick={() => setOpen(true)} aria-label={'Khách hàng: ' + cur.name + '. Bấm để đổi'}>
          <span className="cp-av">{cur.code.slice(0, 3)}</span><span className="cp-nm"><b>{cur.name}</b><span className="small muted">{[cur.tax_code && 'MST ' + cur.tax_code, cur.contact, cur.phone].filter(Boolean).join(' · ') || cur.code}</span></span>
          <span className="small cp-chg">Đổi</span></button>
        : <input className="cp-in" autoFocus={autoFocus || open} value={q} placeholder="Gõ tên, mã, MST hoặc SĐT để tìm khách hàng…" role="combobox" aria-expanded={open} aria-autocomplete="list"
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % Math.max(1, n)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + n) % Math.max(1, n)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (hi < hits.length) { if (hits[hi]) pick(hits[hi]); } else if (q.trim()) setCreate(q.trim()); } else if (e.key === 'Escape') setOpen(false); }} />}
      {open && <ul className="cp-pop" role="listbox">
        {hits.map((c, i) => <li key={c.id} role="option" aria-selected={i === hi}><button type="button" className={'cp-it' + (i === hi ? ' hi' : '') + (c.id === value ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={() => pick(c)}>
          <span className="cp-av">{c.code.slice(0, 3)}</span><span className="cp-nm"><b>{c.name}</b><span className="small muted">{[c.code, c.tax_code && 'MST ' + c.tax_code, c.phone].filter(Boolean).join(' · ')}</span></span>
          {c.id === value && <Icon name="check" size={16} />}</button></li>)}
        {hits.length === 0 && !q.trim() && <li className="small muted cp-empty">Chưa có khách hàng nào.</li>}
        {hits.length === 0 && q.trim() && !canCreate && <li className="small muted cp-empty">Không tìm thấy “{q}”.</li>}
        {canCreate && <li><button type="button" className={'cp-it cp-new' + (hi === hits.length ? ' hi' : '')} onMouseEnter={() => setHi(hits.length)} onClick={() => setCreate(q.trim())}>
          <span className="cp-av"><Icon name="plus" size={16} /></span><span className="cp-nm"><b>{q.trim() ? `Tạo khách hàng mới “${q.trim()}”` : 'Tạo khách hàng mới'}</b></span></button></li>}
      </ul>}
      {create !== null && <CustomerForm init={{ name: create }} list={list} onClose={() => setCreate(null)} onSaved={(c) => { setCreate(null); onCreated?.(c); pick(c); }} />}
    </div>);
}

/** Khung tạo / sửa khách hàng (kiểm tra trùng tên, MST) */
export function CustomerForm({ init, list, onClose, onSaved }: { init: Partial<Customer>; list: Customer[]; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [f, setF] = useState<Partial<Customer>>({ code: init.code ?? (init.name ? codeOf(init.name) : ''), ...init });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const others = list.filter((c) => c.id !== init.id);
  const dupName = f.name?.trim() && others.find((c) => norm(c.name) === norm(f.name!.trim()));
  const dupTax = f.tax_code?.trim() && others.find((c) => c.tax_code && c.tax_code.trim() === f.tax_code!.trim());
  const dupCode = f.code?.trim() && others.find((c) => c.code.toUpperCase() === f.code!.trim().toUpperCase());
  const [vtext, setVtext] = useState((init.vehicles ?? []).map((v) => v.plate + (v.driver ? ' - ' + v.driver : '')).join('\n'));
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null); const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => { if (f.logo_path) sb.storage.from('files').createSignedUrl(f.logo_path, 3600).then(({ data }) => setLogoUrl(data?.signedUrl ?? '')); else setLogoUrl(''); }, [f.logo_path]);
  const pickLogo = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) { setErr('Logo phải là ảnh PNG, JPG, SVG hoặc WEBP'); return; }
    if (file.size > 8 * 1024 * 1024) { setErr('Logo tối đa 8 MB'); return; }
    setErr(''); setLogo({ file, url: URL.createObjectURL(file) }); };
  const save = async () => { setBusy(true); setErr('');
    let logo_path = f.logo_path ?? null;
    if (logo) { const ext = logo.file.name.split('.').pop()?.toLowerCase() || 'png'; const path = `logos/${(f.code ?? 'kh').trim().toUpperCase()}-${Date.now()}.${ext}`;
      const up = await sb.storage.from('files').upload(path, logo.file, { contentType: logo.file.type }); if (up.error) { setBusy(false); setErr(errText(up.error)); return; } logo_path = path; }
    const row = { code: f.code!.trim().toUpperCase(), name: f.name!.trim(), tax_code: f.tax_code?.trim() || null, address: f.address?.trim() || null, contact: f.contact?.trim() || null,
      phone: f.phone?.trim() || null, email: f.email?.trim() || null, note: f.note?.trim() || null, logo_path, kind: f.kind ?? 'khach_hang', position: f.position?.trim() || null,
      vehicles: vtext.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [plate, ...rest] = l.split(/\s+[-–]\s+/); return { plate: plate.trim(), driver: rest.join(' - ').trim() || undefined }; }),
      ship_addresses: (f.ship_addresses ?? []).map((x) => x.trim()).filter(Boolean) };
    const r = init.id ? await sb.from('customers').update(row).eq('id', init.id).select('*').single() : await sb.from('customers').insert(row).select('*').single();
    setBusy(false); if (r.error) setErr(errText(r.error)); else onSaved(r.data as Customer); };
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal cp-form" role="dialog" aria-modal="true" aria-labelledby="cpf-h" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="mv-head"><h2 id="cpf-h" style={{ margin: 0 }}>{init.id ? 'Sửa đối tác' : init.kind === 'van_chuyen' ? 'Đơn vị vận chuyển mới' : 'Khách hàng mới'}</h2><button type="button" className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <div className="grid2">
        <label className="f f-wide">Tên công ty *<input autoFocus value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value, code: init.id || (f.code && f.code !== codeOf(f.name ?? '')) ? f.code : codeOf(e.target.value) })} placeholder="VD: Công ty CP Euro Windows" /></label>
        <label className="f">Mã viết tắt *<input value={f.code ?? ''} onChange={set('code')} maxLength={12} placeholder="VD: EW" /></label>
        <label className="f">Mã số thuế<input value={f.tax_code ?? ''} onChange={set('tax_code')} inputMode="numeric" /></label>
        <label className="f f-wide">Địa chỉ<input value={f.address ?? ''} onChange={set('address')} /></label>
        <label className="f">Loại đối tác<select value={f.kind ?? 'khach_hang'} onChange={(e) => setF({ ...f, kind: e.target.value as Customer['kind'] })}>
          <option value="khach_hang">Khách hàng</option><option value="van_chuyen">Đơn vị vận chuyển</option><option value="noi_bo">Nội bộ (Phương Nam, IPC, Hanwa)</option></select></label>
        <label className="f">Người đại diện<input value={f.contact ?? ''} onChange={set('contact')} /></label>
        <label className="f">Chức vụ<input value={f.position ?? ''} onChange={set('position')} placeholder="VD: Giám đốc" /></label>
        <label className="f">Điện thoại<input value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" /></label>
        <label className="f f-wide">Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        {f.kind === 'van_chuyen' && <label className="f f-wide">Danh sách xe <small className="muted">· mỗi dòng: biển số - tài xế</small>
          <textarea rows={3} value={vtext} onChange={(e) => setVtext(e.target.value)} placeholder={'51C-126.40 - Nguyễn Văn B\n51D-889.12 - Trần Văn C'} /></label>}
        {f.kind !== 'van_chuyen' && <label className="f f-wide">Địa chỉ giao hàng <small className="muted">· mỗi dòng một địa chỉ, chọn khi lập phiếu giao</small>
          <textarea rows={3} value={(f.ship_addresses ?? []).join('\n')} onChange={(e) => setF({ ...f, ship_addresses: e.target.value.split('\n') })} placeholder={'VD: Kho Bình Dương – KCN VSIP 2, Thủ Dầu Một\nCông trình Thủ Thiêm – Lô 3A, TP Thủ Đức'} /></label>}
        <div className="f f-wide"><span>Logo <small className="muted">· in ở đầu chứng từ khi công ty này là bên bán</small></span>
          <div className="cp-logo">
            <span className="cp-logo-box">{logo?.url || logoUrl ? <img src={logo?.url || logoUrl} alt={'Logo ' + (f.name ?? '')} /> : <span className="small muted">Chưa có logo</span>}</span>
            <span className="row" style={{ gap: 6 }}><label className="btn sm"><Icon name="upload" size={14} />{logo || f.logo_path ? 'Đổi logo' : 'Tải logo'}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={pickLogo} /></label>
              {(logo || f.logo_path) && <button type="button" className="btn sm" onClick={() => { setLogo(null); setF({ ...f, logo_path: null }); }}>Bỏ logo</button>}</span>
          </div></div>
      </div>
      {(dupName || dupTax || dupCode) && <div className="msg warn" role="alert"><Icon name="alert" size={16} /><span>
        {dupTax ? `MST đã thuộc “${dupTax.name}”. ` : ''}{dupName ? `Đã có khách tên “${dupName.name}”. ` : ''}{dupCode ? `Mã ${dupCode.code} đã dùng cho “${dupCode.name}”.` : ''}</span></div>}
      {err && <div className="msg err" role="alert"><Icon name="alert" size={16} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Huỷ</button>
        <button type="button" className="btn primary" disabled={busy || !f.name?.trim() || !f.code?.trim() || !!dupTax || !!dupCode} onClick={save}>{busy ? 'Đang lưu…' : init.id ? 'Lưu' : 'Tạo và chọn'}</button></div>
    </div></div>);
}
