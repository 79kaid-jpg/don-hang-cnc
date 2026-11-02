import { chipKind } from '../lib/format';
export const Chip = ({ s, text }: { s: string; text?: string }) => <span className={'chip ' + chipKind(s)}>{text ?? s}</span>;
export const Msg = ({ err, ok }: { err?: string; ok?: string }) =>
  err ? <div className="msg err" role="alert">{err}</div> : ok ? <div className="msg ok">{ok}</div> : null;
