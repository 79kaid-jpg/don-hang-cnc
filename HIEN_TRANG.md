# PMS – Hiện trạng hệ thống (16/11/2026)

> Đọc file này + `CLAUDE.md` khi mở phiên mới. Giai đoạn: **UAT** (dữ liệu đã reset 15/11, backup ở schema `uat_backup_20261115`).

## 1. Hạ tầng
| Mục | Giá trị |
|---|---|
| Repo | `79kaid-jpg/don-hang-cnc` (front-end ở `web/`, React + TS + Vite, HashRouter) |
| Web | https://pms.ksideworks.com/ (GitHub Pages, tên miền riêng; link cũ 79kaid-jpg.github.io/don-hang-cnc/ tự chuyển sang, deploy khi push `main`, giữ `dist/assets` cũ 7 ngày) |
| Supabase | project `wtybzzlglgvzflovqhng` – Postgres + RLS + RPC security definer, view `docs_v` |
| Edge functions | `zalo` (v17, verify_jwt=false), `admin-users`, `base`, `excel-check`, `integration-test` (`uat-clean` đã tắt – 410) |
| Migration | `supabase/migrations/2026111500000NN_*.sql`, mới nhất **32** (`doc_visible_multi_co`). Áp dụng bằng MCP `apply_migration` rồi lưu file |
| Commit | `git -c user.name="Kaka 10" -c user.email=79kaid@gmail.com commit` + dòng Co-Authored-By; push rồi chờ `gh run list -L1` |
| Tài khoản test | `test.ui@pms.local` (id `4468ca7d…`), mật khẩu chỉ trong `web/.env.test.local` (không in/commit). **Đang khoá** – mở: `profiles.active=true` + `auth.users.banned_until=null`; khoá lại sau khi dùng |

## 2. Quy trình & dữ liệu
- Đơn đi **QT0 Bóc tách → QT1 XNĐH → QT2 Lệnh gia công → QT3 → (QT4)**; mỗi QT có `batches` (lượt) và `docs` (phiếu theo công ty PN / IPC / HW), bước `lap → kiem_tra → duyet → da_duyet` (+ cấp duyệt thêm, trả về, thất bại).
- 3 công ty: **PN** (Phương Nam CNC, unit `CNC`), **IPC**, **HW** (Hanwa, unit `HANWA`). QT0 dùng chung, QT1+ mỗi công ty 1 phiếu.
- Mẫu in: `print_templates` (QT0 v3 sinh từ `tools/templates/danh_sach_tam.py`, engine `lib/xlsxTpl.ts`, marker `{ds.k?}` ẩn cột trống).

### Đánh số (mới đổi 16/11)
| Loại | Mẫu | Đếm | Nơi xử lý |
|---|---|---|---|
| Mã nội bộ đơn (QT0) | `{mã KH cuối}-{YYMM}-{NN}` vd `BM-2611-01` | theo khách + tháng | trigger `set_order_code`, bộ đếm `co_counters2` key `ORD|KH|YYMM` |
| Mã đơn công ty (QT1) | `companies.rule` = `{DA}{B1}{YYMM}-{STT:2}` vd `SLUCOLP2611-01` | công ty + kỳ + dự án | `_co_make_code`, `co_preview`; token `{B1}` = chữ đầu công ty, `{YYMM}` |
| Số CT XNĐH | `{BAN}-{YYYY}/{SEQ:4}` | cấp khi duyệt, reset theo năm | `ct_preview`, cột `ct_last` |
Đơn cũ giữ mã `ĐH-YYYYMM-NNN`.

## 3. Phân quyền
- `user_co_roles(user_id, company, roles[])` – vai trò **theo từng công ty**; `profiles.roles` là hợp nhất; `admin_it` = IT quản trị toàn quyền.
- `profiles.active_co` = công ty đang làm (nút công ty / `ScopeChip` → RPC `set_active_co`, sau đó phát event `scope-synced`). `has_role` theo `active_co`.
- **Xem phiếu**: `doc_visible` = admin, hoặc QT0, hoặc công ty thuộc `user_cos(app_uid())` (đơn vị + user_co_roles + chain_people).
- **Thao tác**: RPC `can_act(doc)`; client `canActQ` chỉ nhớ kết quả `true` (60s).
- Gán người từng bước: `chain_people(proc, role, company, user_id|group_id, sla_h)` (màn **Phụ trách quy trình**).
- Làm thay: `profiles.impersonating`, `app_uid()` trả người được làm thay.
- RPC `user_set_access(p_user, p_admin, p_cos)` – **không ghi đè đơn vị** nữa (chỉ điền khi trống/IT/KHAC).
- Vai trò ẩn trên UI: `ipc`, `ke_hoach`, `mua_hang`; "Admin CNC" đổi tên "Admin".

## 4. Zalo
- Bot "Bot PMS Notification" (`app_settings.zalo_bot_name`), link `zalo_bot_link` = https://zalo.me/4132198661715961819, link mời nhóm https://bot.zaloplatforms.com/groups/invite/bot.RjrIfAmD.
- Gửi: `_zsend` (pg_net), log `zalo_out`; dòng cuối tin có mã ngắn (`_reply_hint`). Trả lời không cần quote: lấy phiếu từ tin bot gần nhất (48h).
- @tag: `_zalo_mentions`, `nudge(p_doc, p_text, p_tags)`.
- Nhóm: bảng `zalo_groups` (events, projects[], all_projects, rule_customers, rule_prefix), trigger `zg_docs`/`zg_orders`, lệnh trong nhóm `/noi [PN|IPC|HW|tatca]`, `/noi duan CODE`, `/huy`, `/nhom` (bot chỉ nhận tin khi bị @mention; edge function bỏ mention). Nhóm "Nội bộ | SLU & Cổ Loa" ↔ dự án SLUCOL.

## 5. Tính năng UI chính (web/src)
- `pages/OrderDetail.tsx` + `components/ProcPanel.tsx`: tải song song (`lib/orderData.ts`: `procData`, `allPeople`, `allCustomers`, cache `lib/qcache`), skeleton `.pp-skel`. Ô chọn phiếu QT1+ **chỉ hiện phiếu của công ty đang chọn**, nhãn = mã đơn công ty.
- `components/HeadInput.tsx`: kiểu field int, money, percent, datetime, multi, bool, email, phone, url, lookup, formula, location (Leaflet `MiniMap`, Esri tiles + geocode, kéo ghim cập nhật địa chỉ).
- `components/FieldsAdmin.tsx` xoá field (RPC `field_usages`); `NumInput` hiện phân cách nghìn cho cột "(đ".
- `components/DwgView.tsx`: xem **.dwg** trong `Viewer` (libredwg-web WASM → SVG, kéo/chụm/zoom, nền đen/trắng; không có layer).
- `components/ProjectsAdmin.tsx`: danh sách → chi tiết (bản đồ, đơn, nhóm Zalo), form tạo/sửa.
- `components/CoRoles.tsx`: bảng Công ty × Vai trò (máy tính) / thẻ (điện thoại); `pages/Admin.tsx` UserDetail cảnh báo đơn vị chưa có quyền công ty.
- `pages/RoleGuide.tsx` (`/huong-dan`, ảnh `web/public/hd/*.webp`), `ErrorBoundary`, menu dưới tải sẵn trang chính + phản hồi chạm.
- QT1 `m2_tam` lấy từ QT0 (`_m2_tam`); Bản trình duyệt không kèm nhật ký phê duyệt.

## 6. Dữ liệu UAT hiện có
- Dự án **SLUCOL** (SLU & Cổ Loa), khách cuối **BM** (BM WINDOWS); đơn `ĐH-202611-001` (id `33924470-…`): QT1 PN, IPC đã duyệt; **HW** (`SLUCOLH2611-01`, doc `31dc9ba6-…`) đang **Kiểm tra** – người làm **Vương Trang**.
- Vương Trang (`a14706b5-…`): đơn vị CNC; quyền PN = Kiểm tra F1, HW = Duyệt; gán Kiểm tra QT1/QT3 (PN), QT1/QT2/QT3 (HW); chưa đăng nhập, chưa liên kết Zalo.
- Thông tin công ty PN thiếu điện thoại, MST (mẫu in để trống).

## 7. Việc còn treo / đề xuất chờ duyệt
- Thẻ Kanban (Board) khi công ty đang chọn chưa có mã → hiện "chưa có XNĐH"; đề xuất hiện mã của công ty sở hữu phiếu + nhãn công ty (A) và tự đưa nút công ty về công ty hợp lệ khi làm thay (B) – **chưa duyệt**.
- Menu dưới hướng B (nút cao 64px) và C (giữ trang cũ khi chuyển) – chưa làm.
- Cảnh báo khi gán người ngoài công ty ở Phụ trách quy trình – chưa làm.
- Mẫu mã nội bộ `BM-…` đang cố định trong code SQL, chưa chỉnh được ở trang Đánh số.
- Lỗi trang trắng: đã có ErrorBoundary, chưa nhận log console từ người dùng.

## 8. Lưu ý khi làm việc
- Tuân thủ `CLAUDE.md`: phân tích + phương án (pros/cons, ảnh hưởng laptop/tablet/điện thoại), hỏi "Bạn có đồng ý cho mình làm không?" trước khi sửa.
- Postgres regex dùng `\y` (không phải `\b`). Biến PL/pgSQL không trùng tên cột (lỗi "ambiguous").
- Container không truy cập được github.io / OSM / Esri; test UI bằng `npx vite --port 4173` + Playwright.
- Không spam Zalo; test trên đơn có tiền tố `[MẪU]`.
