/** Màu riêng cho từng quy trình, dùng chung toàn app */
export const QT_NAME: Record<string, string> = { QT0: 'Tiếp nhận & bóc tách', QT1: 'Xác nhận đơn hàng', QT2: 'Lệnh GC & NVL', QT3: 'Giao hàng' };
export const qtOfTab = (tab: string) => (tab === 'F0' || tab === 'F1' ? 'QT0' : tab === 'F2' ? 'QT1' : tab === 'GH' ? 'QT3' : 'QT2');
export const qtOfDoc = (d: string) => (d === 'F2' ? 'QT1' : d.startsWith('LGH') ? 'QT3' : 'QT2');
export const qtOfStep = (s: string) => s.slice(0, 3).toUpperCase();
export const QtTag = ({ qt, long }: { qt: string; long?: boolean }) => (
  <span className={'qt-tag ' + qt.toLowerCase()} title={QT_NAME[qt]}>{qt}{long && <span> · {QT_NAME[qt]}</span>}</span>);
