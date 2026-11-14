import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase';
import { viewUrl } from '../lib/viewer';
import type { Doc } from '../lib/proc';

type F = { kind: string; name: string; path: string; at?: string };
/** Ảnh ghi chú đính kèm khi trả về, gần thời điểm `at` (±3 phút) */
export const rtFilesAt = (d: Pick<Doc, 'files'>, at: string): F[] => { const t = +new Date(at);
  return (d.files ?? []).filter((f) => f.kind === 'tra_ve' && f.at && Math.abs(+new Date(f.at) - t) < 180000); };

/** Hàng ảnh nhỏ – bấm mở xem to */
export function RtThumbs({ files, size = 64 }: { files: F[]; size?: number }) {
  const [u, setU] = useState<Record<string, string>>({});
  useEffect(() => { let live = true; if (!files.length) return;
    sb.storage.from('files').createSignedUrls(files.map((f) => f.path), 3600).then(({ data }) => { if (live && data) setU(Object.fromEntries(data.map((x, i) => [files[i].path, x.signedUrl ?? '']))); });
    return () => { live = false; }; }, [files.map((f) => f.path).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!files.length) return null;
  return <div className="rt-th" role="list">{files.map((f, i) => <button key={f.path} type="button" role="listitem" className="rt-th-it" style={{ width: size, height: size }}
    aria-label={'Xem ' + f.name} disabled={!u[f.path]} onClick={() => viewUrl(u[f.path], f.name || 'Ảnh ghi chú ' + (i + 1) + '.png')}>
    {u[f.path] ? <img src={u[f.path]} alt="" loading="lazy" /> : <span className="rt-th-sk" />}</button>)}</div>;
}
