import { useState } from 'react';
import { Icon } from '../components/Icon';
import { BUILD, applyUpdate, isIOSNotSafari, platform, useInstall, useUpdate } from '../lib/pwa';
import { toast } from '../components/ui';

const URL_APP = 'https://79kaid-jpg.github.io/don-hang-cnc/';

/** Hướng dẫn cài app vào màn hình chính, theo đúng thiết bị đang dùng */
export default function Install() {
  const { standalone, canPrompt, prompt } = useInstall();
  const update = useUpdate();
  const detected = platform();
  const [tab, setTab] = useState<'ios' | 'android' | 'desktop'>(detected);
  const copy = async () => { try { await navigator.clipboard.writeText(URL_APP); toast('Đã chép đường dẫn app'); } catch { /* bỏ qua */ } };

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="ins-step"><span className="dot wait">{n}</span><div>{children}</div></li>);

  return (
    <>
      <div className="page-head"><div><h1>Cài app lên màn hình chính</h1>
        <p className="muted">Mở như một ứng dụng: biểu tượng riêng, toàn màn hình, không thanh địa chỉ. App tự cập nhật khi có bản mới.</p></div></div>

      {standalone ? (
        <div className="msg ok"><Icon name="check" size={18} /><span>Bạn đang dùng app từ màn hình chính. Không cần làm gì thêm.</span></div>
      ) : canPrompt ? (
        <div className="card row between">
          <div><b>Thiết bị này cài được ngay</b><div className="small muted">Bấm nút, rồi chọn “Cài đặt” trong hộp thoại.</div></div>
          <button className="btn primary" onClick={async () => { if (await prompt()) toast('Đã cài app'); }}><Icon name="download" size={18} />Cài app</button>
        </div>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Thiết bị">
        {([['ios', 'iPhone / iPad'], ['android', 'Android'], ['desktop', 'Máy tính']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}{k === detected ? ' · máy bạn' : ''}</button>))}
      </div>

      <div className="card">
        {tab === 'ios' && (<>
          {isIOSNotSafari() && <div className="msg err" style={{ marginBottom: 12 }}><Icon name="alert" size={18} /><span>Bạn đang mở trong Chrome / Zalo / Facebook. Trên iPhone chỉ <b>Safari</b> mới thêm được vào màn hình chính: chép đường dẫn rồi mở bằng Safari.</span></div>}
          <ol className="ins-steps">
            <Step n={1}>Mở <b>{URL_APP}</b> bằng <b>Safari</b>. <button className="btn sm" onClick={copy}>Chép đường dẫn</button></Step>
            <Step n={2}>Bấm nút <b>Chia sẻ</b> <span className="kbd"><Icon name="share" size={16} /></span> ở thanh dưới (iPad: góc trên bên phải).</Step>
            <Step n={3}>Kéo xuống, chọn <b>Thêm vào MH chính</b> (Add to Home Screen).</Step>
            <Step n={4}>Giữ tên <b>Đơn hàng</b>, bấm <b>Thêm</b>. Biểu tượng chữ C vàng xuất hiện trên màn hình chính.</Step>
            <Step n={5}>Mở app từ biểu tượng và <b>đăng nhập lại một lần</b> (app trên màn hình chính có phiên đăng nhập riêng với Safari).</Step>
          </ol>
          <p className="small muted" style={{ marginBottom: 0 }}>Muốn nhận thông báo đẩy sau này: cần iOS 16.4 trở lên và mở từ biểu tượng trên màn hình chính.</p>
        </>)}
        {tab === 'android' && (
          <ol className="ins-steps">
            <Step n={1}>Mở <b>{URL_APP}</b> bằng <b>Chrome</b>. <button className="btn sm" onClick={copy}>Chép đường dẫn</button></Step>
            <Step n={2}>Nếu thấy thanh <b>“Cài đặt ứng dụng”</b> hoặc nút <b>Cài app</b> ở trên: bấm vào là xong.</Step>
            <Step n={3}>Nếu không: bấm menu <b>⋮</b> góc trên bên phải → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào màn hình chính</b>).</Step>
            <Step n={4}>Xác nhận <b>Cài đặt</b>. App xuất hiện trong danh sách ứng dụng và màn hình chính.</Step>
          </ol>)}
        {tab === 'desktop' && (
          <ol className="ins-steps">
            <Step n={1}>Mở app bằng <b>Chrome</b> hoặc <b>Edge</b>.</Step>
            <Step n={2}>Bấm biểu tượng <b>cài đặt</b> <span className="kbd"><Icon name="download" size={16} /></span> ở cuối thanh địa chỉ, hoặc menu <b>⋮ → Cài đặt Đơn hàng CNC</b>.</Step>
            <Step n={3}>App mở trong cửa sổ riêng, ghim được vào thanh tác vụ (Windows) hoặc Dock (Mac).</Step>
          </ol>)}
      </div>

      <section className="card" aria-labelledby="h-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 id="h-up">Tự động cập nhật</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>App kiểm tra bản mới mỗi 5 phút, khi có mạng lại và mỗi lần bạn mở lại app.</li>
          <li>Có bản mới: hiện thanh <b>“Đã có phiên bản mới”</b>. Bấm <b>Cập nhật</b> hoặc chỉ cần thoát ra rồi mở lại app là tự cập nhật.</li>
          <li>Đang gõ dở một ô nhập thì app không tự tải lại, để không mất dữ liệu.</li>
        </ul>
        <div className="row"><span className="small muted">Phiên bản hiện tại: <b>{BUILD}</b></span>
          {update ? <button className="btn sm primary" onClick={applyUpdate}><Icon name="refresh" size={16} />Cập nhật ngay</button>
            : <button className="btn sm" onClick={() => location.reload()}><Icon name="refresh" size={16} />Tải lại</button>}</div>
      </section>
    </>
  );
}

/** Thanh báo có bản mới – hiện trên mọi trang */
export function UpdateBar() {
  const update = useUpdate();
  if (!update) return null;
  return (
    <div className="update-bar" role="status">
      <Icon name="refresh" size={18} /><span style={{ flex: 1 }}>Đã có phiên bản mới của app.</span>
      <button className="btn sm primary" onClick={applyUpdate}>Cập nhật</button>
    </div>
  );
}

/** Gợi ý cài app (chỉ trên điện thoại, chưa cài, có thể ẩn) */
export function InstallHint() {
  const { standalone } = useInstall();
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('hide-install') === '1'; } catch { return false; } });
  if (standalone || hide || platform() === 'desktop') return null;
  return (
    <div className="card row" style={{ background: 'var(--gold-tint)' }}>
      <Icon name="phone" size={22} />
      <span style={{ flex: '1 1 200px' }}><b>Cài app lên màn hình chính</b><br /><span className="small">Mở nhanh như ứng dụng, tự cập nhật.</span></span>
      <a className="btn sm primary" href="#/cai-app">Xem cách cài</a>
      <button className="btn sm icon-btn" aria-label="Ẩn gợi ý" onClick={() => { setHide(true); try { localStorage.setItem('hide-install', '1'); } catch { /* */ } }}><Icon name="x" size={16} /></button>
    </div>
  );
}
