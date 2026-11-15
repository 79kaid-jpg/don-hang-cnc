import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';
import { Msg, confirmDialog } from './ui';

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
/** Ô sửa tên bot (Quản trị) */
export function BotNameEdit({ canEdit }: { canEdit: boolean }) {
  const [name, save] = useBotName(); const [v, setV] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const cur = v ?? name;
  return <div className="card" style={{ display: 'grid', gap: 8 }}>
    <b>Tên bot Zalo</b><span className="small muted">Hiện trong hướng dẫn liên kết Zalo cho người dùng. Đổi khi thay bot.</span>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><input style={{ flex: '1 1 220px', minHeight: 40 }} value={cur} disabled={!canEdit} maxLength={80} aria-label="Tên bot Zalo" onChange={(e) => setV(e.target.value)} />
      {canEdit && <button className="btn primary" disabled={!cur.trim() || cur === name} onClick={async () => { const e = await save(cur); setMsg(e ?? 'Đã lưu'); if (!e) setV(null); }}>Lưu</button>}</div>
    {msg && <span className="small muted" role="status">{msg}</span>}
  </div>;
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
          <li>Mở Zalo, tìm <b>{bot}</b> và bấm Nhắn tin.</li>
          <li>Gửi cho bot mã: <b className="zalo-code">{code}</b> <button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(code)}>Chép mã</button></li>
          <li>Bot trả lời "Đã liên kết" là xong. Mã có hiệu lực 30 phút. <span className="muted">Đang chờ…</span></li>
        </ol>)}
      <Msg err={err} ok="" />
    </div>);
}
