import { Component, type ReactNode } from 'react';

/** Bắt lỗi hiển thị: thay vì trang trắng, hiện thông báo + nội dung lỗi để gửi cho IT. reset khi đổi trang. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: Error | null; key?: string }> {
  state: { err: Error | null; key?: string } = { err: null, key: this.props.resetKey };
  static getDerivedStateFromError(err: Error) { return { err }; }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { err: Error | null; key?: string }) { return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null; }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) { console.error('[PMS] Lỗi hiển thị', err, info?.componentStack); }
  render() {
    const e = this.state.err; if (!e) return this.props.children;
    // file chương trình cũ không còn (vừa cập nhật) → tải lại là hết
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError/i.test(e.message);
    const txt = `${e.name}: ${e.message}\n${location.href}\n${navigator.userAgent}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
    return <div className="card eb" role="alert">
      <b>{stale ? 'App vừa được cập nhật' : 'Có lỗi khi hiển thị trang này'}</b>
      <p className="small muted" style={{ margin: 0 }}>{stale ? 'Bấm Tải lại để dùng bản mới.' : 'Bấm Tải lại để thử lại. Nếu vẫn lỗi, bấm "Chép lỗi" và gửi cho IT.'}</p>
      {!stale && <pre className="eb-msg">{e.message}</pre>}
      <div className="row"><button className="btn primary" onClick={() => location.reload()}>Tải lại</button>
        {!stale && <button className="btn" onClick={() => navigator.clipboard?.writeText(txt)}>Chép lỗi</button>}
        <a className="btn ghost" href="#/">Về Việc của tôi</a></div>
    </div>;
  }
}
