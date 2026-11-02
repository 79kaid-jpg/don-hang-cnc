# Đơn hàng CNC

Web app thay luồng QT0–QT4 trên BASE. Chuỗi khách hàng: CNC → IPC (KH1) → Hanwa (KH2).
Dữ liệu và quy tắc nghiệp vụ nằm ở **Supabase** (Postgres + RLS + hàm). Giao diện là trang tĩnh trên **GitHub Pages**.

**Đã có (giai đoạn 0–1):**
- Đăng nhập; trang "Việc của tôi" (phiếu chờ duyệt, việc đến lượt).
- Danh sách đơn; tạo đơn với mã ĐH-YYYYMM-NNN tự sinh.
- **F0** tiếp nhận, kèm bản vẽ.
- **F1** chi tiết đơn: dán từ Excel, m² và kg tự tính. Kiểm tra F1 (ĐK1).
- **F2** XNĐH: đơn giá (ẩn với Kho/QC, Kỹ thuật), duyệt nội bộ, KH1 rồi KH2 xác nhận, PDF ký. Đủ điều kiện ĐK2 thì mở nhánh NVL và gia công.
- Chuỗi duyệt nhiều cấp có thể cấu hình; nhật ký; Quản trị người dùng/vai trò/chuỗi duyệt.
- Workflow deploy Pages và workflow sao lưu hằng đêm.

**Chưa làm (giai đoạn 2–4):** QT2 F3/PO/F4 + sổ kho, QT3 F5/F6/F7, QT4 F8/F9 2 chặng, thông báo đẩy/email, in mẫu F1–F9.

```
supabase/migrations/   schema, RLS, hàm nghiệp vụ (chạy theo thứ tự tên file)
supabase/seed.sql      khách IPC/Hanwa + chuỗi duyệt mặc định
web/                   React + TypeScript + Vite
.github/workflows/     deploy.yml (GitHub Pages), backup.yml (pg_dump 01:00 hằng ngày)
```

## 1. Supabase

1. Tạo project. Vùng nên chọn Singapore (`ap-southeast-1`).
2. **SQL Editor**: chạy lần lượt
   - `supabase/migrations/20261103000001_init.sql`
   - `supabase/migrations/20261103000002_storage.sql`
   - `supabase/migrations/20261103000003_harden_grants.sql`
   - `supabase/seed.sql`

   Nếu dùng Supabase CLI: `supabase link --project-ref <ref>` rồi `supabase db push`.
3. **Authentication → Sign In / Providers**: tắt *Allow new users to sign up* để chỉ IT tạo tài khoản. Bật Email.
4. **Authentication → URL Configuration**: *Site URL* = `https://<user>.github.io/<repo>/`.
5. **Authentication → Users → Add user**: tạo tài khoản cho từng người, nhớ tick *Auto confirm*.
6. Cấp quyền IT cho tài khoản đầu tiên (SQL Editor):
   ```sql
   update profiles set roles = '{admin_it}', full_name = 'Kaka 10', unit = 'IT'
   where id = (select id from auth.users where email = '<email của IT>');
   ```
   Các vai trò còn lại, người duyệt từng cấp và hạn giờ chỉnh trên màn hình **Quản trị** của web.
7. **Project Settings → API**: lấy *Project URL* và *publishable/anon key*. Hai giá trị này được phép công khai, vì RLS mới là thứ bảo vệ dữ liệu.

## 2. GitHub Pages

1. Tạo repo và đẩy thư mục này lên nhánh `main`.
   > GitHub Pages miễn phí chỉ dành cho **repo public**; repo private cần gói trả phí.
   > Code public không lộ dữ liệu: trong code không có mật khẩu, và mọi quyền đều kiểm tra ở Supabase.
   > Đừng bao giờ đưa *service_role key* hay mật khẩu database vào code.
2. **Settings → Pages → Source**: chọn *GitHub Actions*.
3. URL Supabase và publishable key đã nằm sẵn trong `web/.env.production` (giá trị công khai), nên không cần khai báo biến repo.
4. **Secrets**: thêm `SUPABASE_DB_URL`. Lấy chuỗi kết nối ở *Connect → Session pooler*, có mật khẩu database. Workflow sao lưu dùng giá trị này.
5. Mỗi lần push vào `main`, trang tự build và deploy. Địa chỉ trang: `https://<user>.github.io/<repo>/`.
   App dùng đường dẫn dạng `#/don/...` nên Pages không cần cấu hình thêm.

## 3. Chạy thử trên máy

```bash
cd web
cp .env.example .env.local   # điền URL + anon key
npm install
npm run dev
```

## Vai trò

| Mã | Làm gì |
|---|---|
| `admin_it` | Mọi quyền, quản trị |
| `kinh_doanh` | Tạo đơn, F0; sửa F1; lập XNĐH, ghi khách xác nhận |
| `ky_thuat` | Bóc tách F1 |
| `kiem_tra_f1` | Kiểm tra F1 (ĐK1) |
| `admin_cnc` | Lập XNĐH, ghi khách xác nhận (sau này: LGC, bàn giao, LGH chặng 1) |
| `duyet` | Xem giá; duyệt các cấp được gán trong Quản trị |
| `kho_qc`, `ke_hoach`, `mua_hang`, `ipc`, `xem` | Dùng ở các giai đoạn sau; `xem` chỉ đọc |

## Quy tắc đã cài trong database

- Trạng thái đơn **chỉ đổi qua hàm**: `start_extraction`, `submit_f1`, `check_f1`, `submit_for_approval`, `decide_approval`, `confirm_customer`, `close_qt1`. Sửa thẳng sẽ bị chặn.
- F1 chỉ sửa được khi đơn ở bước tiếp nhận hoặc bóc tách. Đơn giá chỉ sửa được khi đơn ở bước lập XNĐH.
- Người duyệt chỉ bấm được cấp của chính mình. Từ chối bắt buộc ghi lý do, phiếu quay về người lập và duyệt lại từ cấp 1.
- KH2 (Hanwa) chỉ ghi xác nhận được sau KH1 (IPC).
- Đi tiếp qua ĐK2 phải có đủ 2 xác nhận và PDF đã ký.
- Khối lượng thép tính theo dài × rộng × dày × số tấm × 7,85 kg/dm³. Đơn giá XNĐH tính theo **đ/kg**.

## Sao lưu

`backup.yml` chạy lúc 01:00 mỗi ngày và lưu file `.dump` làm artifact của workflow, giữ 30 ngày.
Khôi phục: `pg_restore --no-owner -d "<db url>" don-hang-cnc-YYYYMMDD.dump`. Nên thử khôi phục mỗi quý một lần.
