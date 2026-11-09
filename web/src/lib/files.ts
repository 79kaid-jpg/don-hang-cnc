/** Tên file an toàn cho khoá lưu trữ (bỏ dấu tiếng Việt, khoảng trắng, ký tự lạ). Tên gốc vẫn giữ để hiển thị. */
export const safeName = (n: string) => {
  const dot = n.lastIndexOf('.');
  const ext = dot > 0 ? n.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot > 0 ? n.slice(0, dot) : n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  return base + ext;
};
