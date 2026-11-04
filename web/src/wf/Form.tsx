import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Icon } from '../components/Icon';
import { computeRow, type Column, type Field, type Perm } from './model';

type Data = Record<string, unknown>;
type Row = Record<string, unknown>;
const fmtN = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : String(v));

/** Hiện biểu mẫu theo quyền của bước: hide / view / edit / required */
export function FormView({ fields, perms, data, onChange, locked }: {
  fields: Field[]; perms: Record<string, Perm>; data: Data; onChange: (id: string, v: unknown) => void; locked?: boolean;
}) {
  const shown = fields.filter((f) => (perms[f.id] ?? 'view') !== 'hide');
  if (!shown.length) return null;
  return (
    <div className="wf-formview">
      {shown.map((f) => {
        const pm = perms[f.id] ?? 'view'; const ed = !locked && (pm === 'edit' || pm === 'required'); const v = data[f.id];
        const label = <span>{f.label}{pm === 'required' && <b className="wf-req" aria-label="bắt buộc"> *</b>}{!ed && <em className="muted"> · chỉ xem</em>}</span>;
        if (f.type === 'table') return <div key={f.id} className="f">{label}{f.help && <small className="muted">{f.help}</small>}
          <TableField cols={f.columns ?? []} rows={(Array.isArray(v) ? v : []) as Row[]} ed={ed} onChange={(r) => onChange(f.id, r)} /></div>;
        if (!ed) return <div key={f.id} className="f">{label}<div className="wf-ro">{fmtN(v) || <span className="muted">—</span>}</div></div>;
        const set = (x: unknown) => onChange(f.id, x);
        return (
          <label key={f.id} className="f">{label}{f.help && <small className="muted">{f.help}</small>}
            {f.type === 'textarea' ? <textarea rows={3} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
              : f.type === 'select' ? <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}><option value="">— Chọn —</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
              : f.type === 'number' ? <input inputMode="decimal" value={String(v ?? '')} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value.replace(',', '.')))} />
              : <input type={f.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />}
          </label>);
      })}
    </div>);
}

/** Bảng có cột công thức, dòng tổng, dán từ Excel / nhập file Excel */
function TableField({ cols, rows, ed, onChange }: { cols: Column[]; rows: Row[]; ed: boolean; onChange: (r: Row[]) => void }) {
  const [msg, setMsg] = useState('');
  const inCols = cols.filter((c) => !c.formula);
  const calcd = rows.map((r) => computeRow(cols, r));
  const setCell = (i: number, k: string, val: string, c: Column) => onChange(rows.map((r, j) => j === i ? { ...r, [k]: c.type === 'number' && val !== '' ? Number(val.replace(',', '.')) : val } : r));
  const toRows = (grid: unknown[][]) => {
    // bỏ dòng tiêu đề nếu ô đầu trùng tên cột
    const first = String(grid[0]?.[0] ?? '').trim().toLowerCase();
    if (inCols.some((c) => c.label.toLowerCase() === first || c.id === first)) grid = grid.slice(1);
    return grid.filter((g) => g.some((x) => String(x ?? '').trim() !== '')).map((g) => Object.fromEntries(inCols.map((c, k) => {
      const x = g[k]; const s = String(x ?? '').trim();
      return [c.id, c.type === 'number' ? (s === '' ? '' : Number(s.replace(/\s/g, '').replace(',', '.'))) : s];
    })));
  };
  const paste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData('text'); if (!t.includes('\t') && !t.includes('\n')) return;
    e.preventDefault();
    const add = toRows(t.replace(/\r/g, '').split('\n').map((l) => l.split('\t')));
    onChange([...rows.filter((r) => Object.values(r).some((x) => x !== '' && x != null)), ...add]); setMsg(`Đã dán ${add.length} dòng`);
  };
  const importXlsx = async (f?: File) => {
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer());
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
    const add = toRows(grid); onChange([...rows, ...add]); setMsg(`Đã nhập ${add.length} dòng từ ${f.name}`);
  };
  const exportXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.label), ...calcd.map((r) => cols.map((c) => r[c.id] ?? ''))]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Bang'); XLSX.writeFile(wb, 'bang.xlsx');
  };
  const sums = cols.map((c) => c.sum ? calcd.reduce((a, r) => a + (Number(r[c.id]) || 0), 0) : null);
  return (
    <div className="wf-tbl-wrap" onPaste={ed ? paste : undefined}>
      <div className="row small" style={{ marginBottom: 6 }}>
        {rows.length > 0 && <button className="btn sm" onClick={exportXlsx}><Icon name="download" size={14} />Xuất Excel</button>}
        {ed && <><span className="muted">Mẹo: copy vùng ô trong Excel (đúng thứ tự cột nhập) rồi bấm vào bảng và dán Ctrl+V.</span>
        <label className="btn sm"><Icon name="upload" size={14} />Nhập Excel<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { importXlsx(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {rows.length > 0 && <button className="btn sm" onClick={async () => { onChange([]); setMsg('Đã xoá hết dòng'); }}>Xoá hết</button>}
        </>}{msg && <span role="status" className="chip done">{msg}</span>}</div>
      <div className="wf-tbl-scroll" tabIndex={0}>
        <table className="wf-tbl">
          <thead><tr><th>#</th>{cols.map((c) => <th key={c.id} className={c.type === 'number' ? 'n' : ''}>{c.label}{c.formula && <small className="muted" title={c.formula}> ƒ</small>}</th>)}{ed && <th />}</tr></thead>
          <tbody>
            {calcd.map((r, i) => (
              <tr key={i}><td className="muted">{i + 1}</td>
                {cols.map((c) => <td key={c.id} className={c.type === 'number' ? 'n' : ''}>
                  {ed && !c.formula ? <input aria-label={`${c.label} dòng ${i + 1}`} inputMode={c.type === 'number' ? 'decimal' : undefined} value={String(rows[i][c.id] ?? '')} onChange={(e) => setCell(i, c.id, e.target.value, c)} />
                    : <span className={c.formula ? 'wf-calc' : ''}>{fmtN(r[c.id])}</span>}</td>)}
                {ed && <td><button className="wf-x" aria-label={`Xoá dòng ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}
              </tr>))}
            {!rows.length && <tr><td colSpan={cols.length + 2} className="muted small" style={{ textAlign: 'center', padding: 16 }}>Chưa có dòng nào{ed ? ' – thêm dòng, dán từ Excel hoặc nhập file' : ''}</td></tr>}
          </tbody>
          {sums.some((x) => x != null) && rows.length > 0 && <tfoot><tr><td>Σ</td>{sums.map((x, k) => <td key={k} className="n"><b>{x == null ? '' : fmtN(Math.round(x * 1000) / 1000)}</b></td>)}{ed && <td />}</tr></tfoot>}
        </table>
      </div>
      {ed && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Thêm dòng</button>}
    </div>);
}
