import { useState } from 'react';
import { Icon } from '../components/Icon';
import { BUILD, applyUpdate, isIOSNotSafari, platform, useInstall, useUpdate } from '../lib/pwa';
import { toast } from '../components/ui';
import { BOT_NAME, ZaloLink } from '../components/ZaloLink';
import ProcessGuide from '../components/ProcessGuide';

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
      <div className="page-head"><div><h1>Hướng dẫn sử dụng</h1>
        <p className="muted">Cài app lên màn hình chính, nhận thông báo duyệt qua Zalo và cập nhật app.</p></div></div>
      <nav className="row" aria-label="Mục hướng dẫn"><a className="btn sm" href="#/cai-app" onClick={(e) => { e.preventDefault(); document.getElementById('h-install')?.scrollIntoView({ behavior: 'smooth' }); }}>1. Cài app</a>
        <a className="btn sm" href="#/cai-app" onClick={(e) => { e.preventDefault(); document.getElementById('h-zalo')?.scrollIntoView({ behavior: 'smooth' }); }}>2. Thông báo Zalo</a>
        <a className="btn sm" href="#/cai-app" onClick={(e) => { e.preventDefault(); document.getElementById('h-up')?.scrollIntoView({ behavior: 'smooth' }); }}>3. Cập nhật</a>
        <a className="btn sm" href="#/cai-app" onClick={(e) => { e.preventDefault(); document.getElementById('h-qt')?.scrollIntoView({ behavior: 'smooth' }); }}>4. Quy trình</a></nav>
      <div><h2 id="h-install" style={{ marginTop: 8 }}>1. Cài app lên màn hình chính</h2>
        <p className="muted">Mở như một ứng dụng: biểu tượng riêng, toàn màn hình, không thanh địa chỉ.</p></div>

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
            <Step n={4}>Giữ tên <b>Đơn hàng</b>, bấm <b>Thêm</b>. Biểu tượng mặt dựng nhôm vàng xuất hiện trên màn hình chính.</Step>
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

      <section className="card" aria-labelledby="h-zalo" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 id="h-zalo">2. Nhận thông báo duyệt qua Zalo</h2>
        <p className="muted" style={{ margin: 0 }}>Bot <b>{BOT_NAME}</b> nhắn riêng cho bạn khi đến lượt bạn duyệt phiếu, và báo cho người tạo đơn khi phiếu bị từ chối. Mỗi người chỉ cần liên kết một lần.</p>
        <ol className="ins-steps">
          <Step n={1}>Bấm <b>Liên kết Zalo</b> ở ô bên dưới (hoặc biểu tượng chuông <span className="kbd"><Icon name="bell" size={16} /></span> trên đầu trang). App hiện một <b>mã 6 số</b>, có hiệu lực 30 phút.</Step>
          <Step n={2}>Mở Zalo trên điện thoại, gõ tìm <b>{BOT_NAME}</b>, bấm <b>Nhắn tin</b>.</Step>
          <Step n={3}>Gửi cho bot đúng mã 6 số đó.</Step>
          <Step n={4}>Bot trả lời <b>"Đã liên kết Zalo với tài khoản …"</b>, app tự chuyển sang <b>Đã liên kết</b>. Xong.</Step>
        </ol>
        <ZaloLink />
        <div className="small" style={{ lineHeight: 1.7 }}>
          <b>Bạn sẽ nhận tin khi:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            <li>Đến lượt bạn duyệt: XNĐH (F2), dự toán NVL (F3), PO, từng cấp lệnh gia công (F5). Tin có mã đơn, tên phiếu, cấp duyệt, hạn và link mở thẳng phiếu.</li>
            <li>Phiếu của đơn bạn tạo bị từ chối: kèm người từ chối và lý do.</li>
          </ul>
          <b>Lưu ý:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            <li>Mở link trong tin nhắn bằng trình duyệt (hoặc app đã cài) và đăng nhập tài khoản của bạn.</li>
            <li>Gửi sai mã hoặc mã hết hạn: bấm Liên kết Zalo lại để lấy mã mới.</li>
            <li>Đổi số Zalo: bấm <b>Huỷ liên kết</b> rồi liên kết lại với Zalo mới.</li>
          </ul>
        </div>
      </section>

      <section className="card" aria-labelledby="h-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 id="h-up">3. Tự động cập nhật</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>App kiểm tra bản mới mỗi 5 phút, khi có mạng lại và mỗi lần bạn mở lại app.</li>
          <li>Có bản mới: hiện thanh <b>“Đã có phiên bản mới”</b>. Bấm <b>Cập nhật</b> hoặc chỉ cần thoát ra rồi mở lại app là tự cập nhật.</li>
          <li>Đang gõ dở một ô nhập thì app không tự tải lại, để không mất dữ liệu.</li>
        </ul>
        <div className="row"><span className="small muted">Phiên bản hiện tại: <b>{BUILD}</b></span>
          {update ? <button className="btn sm primary" onClick={applyUpdate}><Icon name="refresh" size={16} />Cập nhật ngay</button>
            : <button className="btn sm" onClick={() => location.reload()}><Icon name="refresh" size={16} />Tải lại</button>}</div>
      </section>
      <section className="card" aria-labelledby="h-qt" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="h-qt">4. Quy trình đơn hàng</h2>
        <p className="muted" style={{ margin: 0 }}>Bấm một quy trình rồi bấm từng bước để xem ai làm, nhập gì, ai duyệt và làm ở đâu trong app. Dùng để đối chiếu khi chạy đơn.</p>
        <ProcessGuide />
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
