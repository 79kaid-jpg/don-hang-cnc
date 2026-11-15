import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';
import { Msg, confirmDialog, toast } from './ui';

/** Tên bot Zalo – admin đổi trong Quản trị › Kết nối & API */
let botName = 'Bot PMS Notification'; const subs = new Set<(v: string) => void>();
let loaded = false;
export function useBotName(): [string, (v: string) => Promise<string | null>] {
  const [v, setV] = useState(botName);
  useEffect(() => { subs.add(setV); if (!loaded) { loaded = true; sb.from('app_settings').select('value').eq('key', 'zalo_bot_name').maybeSingle().then(({ data }) => { if (data?.value) { botName = data.value; subs.forEach((f) => f(botName)); } }); }
    return () => { subs.delete(setV); }; }, []);
  const save = async (nv: string) => { const { error } = await sb.from('app_settings').upsert({ key: 'zalo_bot_name', value: nv.trim(), updated_at: new Date().toISOString() }); if (error) return errText(error); botName = nv.trim(); subs.forEach((f) => f(botName)); return null; };
  return [v, save];
}
/** Link mở bot trên Zalo (admin dán từ trang quản lý bot) */
let botLink = ''; const lsubs = new Set<(v: string) => void>(); let lloaded = false;
export function useBotLink(): [string, (v: string) => Promise<string | null>] {
  const [v, setV] = useState(botLink);
  useEffect(() => { lsubs.add(setV); if (!lloaded) { lloaded = true; sb.from('app_settings').select('value').eq('key', 'zalo_bot_link').maybeSingle().then(({ data }) => { botLink = data?.value ?? ''; lsubs.forEach((f) => f(botLink)); }); }
    return () => { lsubs.delete(setV); }; }, []);
  const save = async (nv: string) => { const x = nv.trim(); if (x && !/^https?:\/\/\S+$/.test(x)) return 'Link phải bắt đầu bằng https://';
    const { error } = await sb.from('app_settings').upsert({ key: 'zalo_bot_link', value: x, updated_at: new Date().toISOString() }); if (error) return errText(error); botLink = x; lsubs.forEach((f) => f(botLink)); return null; };
  return [v, save];
}
/** Mã QR + nút mở bot. Máy tính: QR để quét bằng điện thoại; điện thoại: nút mở thẳng Zalo */
export function BotQR({ size = 148 }: { size?: number }) {
  const [link] = useBotLink(); const [bot] = useBotName(); const [src, setSrc] = useState('');
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: size * 2, margin: 1 }).then(setSrc).catch(() => setSrc('')); else setSrc(''); }, [link, size]);
  if (!link) return null;
  return <div className="bot-qr">
    {src && <img src={src} width={size} height={size} alt={'Mã QR mở ' + bot + ' trên Zalo'} />}
    <div className="bot-qr-t"><b>{bot}</b><span className="small muted bot-qr-d">Quét mã bằng camera hoặc Zalo trên điện thoại</span>
      <a className="btn primary bot-qr-m" href={link} target="_blank" rel="noreferrer">Mở bot trên Zalo</a>
      <button type="button" className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(link); }}>Chép link bot</button></div>
  </div>;
}
/** Ô sửa tên bot (Quản trị) */
export function BotNameEdit({ canEdit }: { canEdit: boolean }) {
  const [name, save] = useBotName(); const [v, setV] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const cur = v ?? name;
  return <div className="card" style={{ display: 'grid', gap: 8 }}>
    <b>Tên bot Zalo</b><span className="small muted">Hiện trong hướng dẫn liên kết Zalo cho người dùng. Đổi khi thay bot.</span>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><input style={{ flex: '1 1 220px', minHeight: 40 }} value={cur} disabled={!canEdit} maxLength={80} aria-label="Tên bot Zalo" onChange={(e) => setV(e.target.value)} />
      {canEdit && <button className="btn primary" disabled={!cur.trim() || cur === name} onClick={async () => { const e = await save(cur); setMsg(e ?? 'Đã lưu'); if (!e) setV(null); }}>Lưu</button>}</div>
    {msg && <span className="small muted" role="status">{msg}</span>}
    <BotLinkEdit canEdit={canEdit} />
  </div>;
}
function BotLinkEdit({ canEdit }: { canEdit: boolean }) {
  const [link, save] = useBotLink(); const [v, setV] = useState<string | null>(null); const [msg, setMsg] = useState(''); const cur = v ?? link;
  return <><b style={{ marginTop: 6 }}>Link mở bot</b><span className="small muted">Dán link chia sẻ của bot (trong trang quản lý bot Zalo). App tự tạo mã QR cho người dùng quét.</span>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><input style={{ flex: '1 1 220px', minHeight: 40 }} value={cur} disabled={!canEdit} inputMode="url" placeholder="https://zalo.me/..." aria-label="Link mở bot" onChange={(e) => setV(e.target.value)} />
      {canEdit && <button className="btn primary" disabled={cur === link} onClick={async () => { const e = await save(cur); setMsg(e ?? 'Đã lưu'); if (!e) setV(null); }}>Lưu</button>}</div>
    {msg && <span className="small muted" role="status">{msg}</span>}<BotQR size={110} /></>;
}

/** Liên kết Zalo để nhận thông báo duyệt. compact = thẻ nhắc trên trang Việc của tôi (ẩn khi đã liên kết) */
export function ZaloLink({ compact = false }: { compact?: boolean }) {
  const { me, reload, acting } = useAuth();
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [bot] = useBotName();
  // chờ người dùng gửi mã cho bot → kiểm tra lại mỗi 4 giây
  useEffect(() => {
    if (!code || me?.zalo_chat_id) return;
    const t = setInterval(() => reload(), 4000); return () => clearInterval(t);
  }, [code, me?.zalo_chat_id]); // eslint-disable-line
  if (!me || acting) return null;
  if (me.zalo_chat_id) {
    if (compact) return null;
    return (
      <div className="card row between">
        <span><Icon name="check" size={18} /> Đã liên kết Zalo{me.zalo_name ? ' · ' + me.zalo_name : ''}. Bạn nhận thông báo khi đến lượt duyệt và khi phiếu bị từ chối.</span>
        <button className="btn sm" onClick={async () => { if (await confirmDialog('Huỷ liên kết Zalo? Bạn sẽ không nhận thông báo nữa.', 'Huỷ liên kết')) { await sb.rpc('zalo_unlink'); reload(); } }}>Huỷ liên kết</button>
      </div>);
  }
  const get = async () => { setErr(''); const { data, error } = await sb.rpc('zalo_link_code'); if (error) setErr(errText(error)); else setCode(String(data)); };
  return (
    <div className="card zalo-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ gap: 10 }}><span className="zalo-badge" aria-hidden="true">Zalo</span>
        <div style={{ flex: 1, minWidth: 200 }}><b>Nhận thông báo duyệt qua Zalo</b>
          <div className="small muted">Bot nhắn riêng cho bạn khi đến lượt duyệt, kèm link mở thẳng phiếu.</div></div>
        {!code && <button className="btn primary" onClick={get}>Liên kết Zalo</button>}
      </div>
      {code && (
        <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Mở bot: quét mã QR / bấm <b>Mở bot trên Zalo</b> bên dưới, hoặc tìm <b>{bot}</b> trong Zalo, rồi bấm Nhắn tin.</li>
          <li>Gửi cho bot mã: <b className="zalo-code">{code}</b> <button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(code)}>Chép mã</button></li>
          <li>Bot trả lời "Đã liên kết" là xong. Mã có hiệu lực 30 phút. <span className="muted">Đang chờ…</span></li>
        </ol>)}
      {code && <BotQR />}
      <Msg err={err} ok="" />
    </div>);
}

/** Nhóm Zalo nhận thông báo tổng (Quản trị › Kết nối & API) */
type ZG = { chat_id: string; name: string; company: string | null; events: string[]; active: boolean; at: string; projects: string[]; all_projects: boolean; rule_customers: string[]; rule_prefix: string[] };
const ZEV: [string, string][] = [['new_order', 'Đơn mới'], ['approved', 'Phiếu đã duyệt'], ['returned', 'Phiếu bị trả về'], ['late', 'Phiếu trễ hạn']];
export function ZaloGroups({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<ZG[] | null>(null); const [inv, setInv] = useState(''); const [pjs, setPjs] = useState<{ id: string; code: string; name: string }[]>([]); const [custs, setCusts] = useState<{ id: string; name: string }[]>([]);
  const load = () => sb.from('zalo_groups').select('*').order('at').then(({ data }) => setRows((data as ZG[]) ?? []));
  useEffect(() => { load(); sb.from('projects').select('id, code, name').order('code').then(({ data }) => setPjs((data as typeof pjs) ?? [])); sb.from('customers').select('id, name, kind').order('name').then(({ data }) => setCusts(((data ?? []) as { id: string; name: string; kind: string }[]).filter((c) => c.kind !== 'van_chuyen'))); sb.from('app_settings').select('value').eq('key', 'zalo_group_link').maybeSingle().then(({ data }) => setInv(data?.value ?? '')); }, []);
  const up = async (g: ZG, patch: Partial<ZG>) => { const { error } = await sb.from('zalo_groups').update(patch).eq('chat_id', g.chat_id); if (error) toast(errText(error)); load(); };
  const del = async (g: ZG) => { if (!(await confirmDialog(`Huỷ nối nhóm “${g.name || g.chat_id}”? Bot sẽ không gửi tin vào nhóm này nữa (bot vẫn ở trong nhóm).`, 'Huỷ nối', true))) return; await sb.from('zalo_groups').delete().eq('chat_id', g.chat_id); load(); };
  return <div className="card zg" style={{ display: 'grid', gap: 10 }}>
    <b>Nhóm Zalo nhận thông báo</b>
    <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
      <li>Thêm bot vào nhóm: trưởng/phó nhóm mở link mời {inv ? <><a href={inv} target="_blank" rel="noreferrer">{inv}</a> <button type="button" className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(inv)}>Chép</button></> : '(chưa có)'}</li>
      <li>Admin (đã liên kết Zalo với PMS) gõ trong nhóm: <span className="kbd">/noi PN</span> · <span className="kbd">/noi IPC</span> · <span className="kbd">/noi HW</span> · hoặc <span className="kbd">/noi tatca</span> · nhóm theo dự án: <span className="kbd">/noi duan SLUC</span> (nhiều mã cách nhau dấu cách)</li>
      <li>Nhóm theo dự án: đặt <b>quy tắc tự thêm</b> (khách cuối, đầu mã dự án) để dự án mới tự vào nhóm. Hoặc chọn nhóm ngay trong Quản trị › Dự án › Sửa.</li>
      <li>Nhóm hiện ở danh sách dưới; chọn loại tin nhóm nhận. Gõ <span className="kbd">/nhom</span> để xem, <span className="kbd">/huy</span> để huỷ.</li></ol>
    {rows === null ? <span className="small muted">Đang tải…</span> : !rows.length ? <p className="small muted" style={{ margin: 0 }}>Chưa có nhóm nào được nối.</p>
      : <ul className="zg-list">{rows.map((g) => <li key={g.chat_id} className={g.active ? '' : 'off'}>
        <div className="zg-h"><b>{g.name || 'Nhóm ' + g.chat_id.slice(0, 6)}</b>
          <select disabled={!canEdit} value={g.company ?? ''} aria-label="Công ty" onChange={(e) => up(g, { company: e.target.value || null })}><option value="">Tất cả công ty</option><option value="PN">Phương Nam CNC</option><option value="IPC">IPC</option><option value="HW">Hanwa</option></select>
          <label className="zg-sw"><input type="checkbox" disabled={!canEdit} checked={g.active} onChange={(e) => up(g, { active: e.target.checked })} />{g.active ? 'Đang bật' : 'Đang tắt'}</label>
          {canEdit && <button type="button" className="fa-del" aria-label="Huỷ nối nhóm" title="Huỷ nối nhóm" onClick={() => del(g)}><Icon name="trash" size={15} /></button>}</div>
        <div className="zg-pj"><span className="small muted">Dự án:</span>
          <select disabled={!canEdit} value={g.all_projects ? 'all' : 'pick'} aria-label="Phạm vi dự án" onChange={(e) => up(g, { all_projects: e.target.value === 'all' })}><option value="all">Mọi dự án</option><option value="pick">Chỉ dự án đã chọn</option></select>
          {!g.all_projects && <>{g.projects.map((id) => { const p = pjs.find((x) => x.id === id); return <span key={id} className="zg-chip" title={p?.name}>{p?.code ?? '…'}{canEdit && <button type="button" aria-label={'Bỏ dự án ' + (p?.code ?? '')} onClick={() => up(g, { projects: g.projects.filter((x) => x !== id) })}>✕</button>}</span>; })}
            {canEdit && <select value="" aria-label="Thêm dự án" onChange={(e) => e.target.value && up(g, { projects: [...g.projects, e.target.value] })}><option value="">+ Thêm dự án…</option>{pjs.filter((p) => !g.projects.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.code}{p.name && p.name !== p.code ? ' · ' + p.name : ''}</option>)}</select>}</>}</div>
        {!g.all_projects && <div className="zg-pj zg-rule"><span className="small muted">Tự thêm dự án mới khi khách cuối là:</span>
          {g.rule_customers.map((id) => <span key={id} className="zg-chip">{custs.find((c) => c.id === id)?.name ?? '…'}{canEdit && <button type="button" aria-label="Bỏ" onClick={() => up(g, { rule_customers: g.rule_customers.filter((x) => x !== id) })}>✕</button>}</span>)}
          {canEdit && <select value="" aria-label="Thêm khách cuối" onChange={(e) => e.target.value && up(g, { rule_customers: [...g.rule_customers, e.target.value] })}><option value="">+ Khách cuối…</option>{custs.filter((c) => !g.rule_customers.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <span className="small muted">hoặc mã dự án bắt đầu bằng:</span>
          <input className="zg-pre" disabled={!canEdit} defaultValue={g.rule_prefix.join(', ')} placeholder="VD: SLU, CL" aria-label="Tiền tố mã dự án"
            onBlur={(e) => { const v = e.target.value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean); if (v.join() !== g.rule_prefix.join()) up(g, { rule_prefix: v }); }} /></div>}
        <div className="zg-ev">{ZEV.map(([k, l]) => { const on = g.events.includes(k); return <button key={k} type="button" disabled={!canEdit || !g.active} aria-pressed={on} className={on ? 'on' : ''}
          onClick={() => up(g, { events: on ? g.events.filter((x) => x !== k) : [...g.events, k] })}>{on ? '✓ ' : ''}{l}</button>; })}</div></li>)}</ul>}
    <p className="small muted" style={{ margin: 0 }}>Tin cá nhân (đến lượt bạn, nhắc việc, tag) vẫn gửi riêng từng người. Đơn [MẪU] không gửi vào nhóm. Trong nhóm, muốn ghi vào phiếu thì gõ mã phiếu trước nội dung, VD “003 ok”.</p>
  </div>;
}
