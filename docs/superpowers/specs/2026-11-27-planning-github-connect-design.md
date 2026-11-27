# Planning: kết nối GitHub bằng một nút

## Mục tiêu

Người dùng kết nối GitHub thật ngay trên giao diện, được hướng dẫn từng bước, không sửa `.env`.

**Không làm đợt này:** khóa Gemini, khóa Web Push, nút gỡ kết nối trên giao diện, nhiều GitHub App trên một máy chủ.

## Cách làm đã cân nhắc

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| Tạo GitHub App từ manifest | Phải lưu khóa và khóa quyền cài đặt | **Đã chọn** |
| Dán token chỉ đọc | Token hết hạn, không đăng nhập được bằng GitHub, webhook làm riêng | Loại |
| Form dán 5 khóa | Người dùng vẫn phải làm các bước khó | Loại |

## Người dùng thấy gì

Thẻ "Kết nối GitHub" gồm 3 bước, bước đang làm được đánh dấu, mỗi bước có một nút chính.

1. **Tạo kết nối** (một lần cho cả máy chủ). Mặc định tạo trong tài khoản cá nhân, có ô tùy chọn nhập tên tổ chức. Bấm **Kết nối GitHub**, xác nhận trên GitHub, rồi quay về Tầng.
2. **Đăng nhập bằng GitHub**, sau đó lưu đội như hiện nay.
3. **Chọn repo.** Bấm cấp quyền trên GitHub. Khi quay về, Tầng tự tải danh sách repo (bỏ bước bấm "Tải repo đã cấp quyền", nút này vẫn giữ để tải lại).

Khi chưa kết nối, thẻ này thay cho dòng "Cần cấu hình GitHub App". Nút dùng thử dữ liệu mẫu vẫn giữ.

Lỗi (hết hạn xác nhận, sai mã cài đặt, GitHub không phản hồi) hiện bằng một câu kèm việc cần làm tiếp.

## Ai được tạo kết nối

- Chỉ tạo được khi máy chủ **chưa có** cấu hình.
- Máy cá nhân (`APP_ENV` khác `production` và `SITE_ADDRESS` trống hoặc `:80`): không cần mã.
- Mọi trường hợp khác: cần **mã cài đặt** ngẫu nhiên, backend in vào log khi khởi động mà chưa có cấu hình. Giao diện chỉ lệnh lấy mã: `docker compose logs backend`. Mã đổi sau mỗi lần khởi động lại và hết tác dụng khi đã kết nối.
- Quyết định này không dựa vào header `Host` hay `Origin`, vì người gọi giả được.

## Luồng kỹ thuật

1. `POST /api/v1/planning/setup/start` nhận `{setup_code?, organization?}`, kiểm tra same-origin. Địa chỉ web lấy từ `Origin` của trình duyệt (chỉ nhận `https`, hoặc `http` với localhost; ở production phải khớp `SITE_URL` nếu `SITE_URL` đã được đặt khác mặc định). Trả `{action, manifest}` và đặt cookie `state` HttpOnly, hạn 10 phút. `state` được lưu cùng địa chỉ web ở server.
2. Trình duyệt gửi form `POST` tới `github.com/settings/apps/new?state=…` (hoặc đường dẫn của tổ chức), mở ở cửa sổ chính vì Planning nằm trong iframe.
3. GitHub chuyển về `GET /api/v1/planning/setup/callback?code&state`. Tầng đối chiếu `state`, gọi `POST /app-manifests/{code}/conversions`, lưu kết quả, rồi chuyển về `/planning`.

**Manifest:** tên `Tang Planning <4 ký tự ngẫu nhiên>`; quyền `pull_requests: read`, `metadata: read`; `callback_urls`, `redirect_url`, `setup_url`, `setup_on_update: true`; `public: true` để thành viên khác tài khoản đăng nhập được. Tầng chỉ đọc repo mà trưởng nhóm đã cấp quyền và chọn.

## Lưu khóa

- Bảng mới `planning_github_app` có đúng một dòng: app ID, slug, client ID, địa chỉ web, và 3 bí mật (client secret, private key, webhook secret).
- 3 bí mật được mã hóa bằng Fernet. Khóa mã hóa tự sinh ở file trong thư mục dữ liệu (volume `appdata`), nên chỉ lộ bản sao DB thì chưa đọc được bí mật. Ai đọc được cả máy chủ thì vẫn đọc được.
- Không trả bí mật qua API, không ghi vào log.
- Mất file khóa: coi như chưa kết nối, kèm cảnh báo trong log.
- **Tương thích:** nếu `.env` đã có đủ `GITHUB_CLIENT_ID` và `GITHUB_CLIENT_SECRET` thì dùng `.env` như hiện nay. Code đọc cấu hình GitHub qua một hàm duy nhất thay cho đọc thẳng `Settings`.
- **Làm lại:** lệnh `python -m app.planning.reset_github` xóa cấu hình đã lưu. App trên GitHub do người dùng tự xóa.

## Chạy trên localhost (không có webhook)

GitHub không gửi webhook tới được localhost. Khi địa chỉ không công khai:

- Manifest bỏ `hook_attributes` và `default_events`.
- Điều kiện bật chọn repo không còn đòi webhook secret.
- Khi trưởng nhóm đang mở Planning, giao diện tự đọc lại PR mỗi 60 giây, và nói rõ điều này trên thẻ repo.

Địa chỉ HTTPS công khai thì đăng ký webhook sự kiện `pull_request` như hiện nay.

**Chưa kiểm chứng:** tài liệu GitHub không nói manifest thiếu `hook_attributes` có được chấp nhận không, và không nói gì về webhook localhost. Phải thử thật trên GitHub. Nếu bị từ chối, dùng `hook_attributes` với `active: false` và một URL công khai giữ chỗ không nhận dữ liệu của bên thứ ba.

## Kiểm tra

- Test backend (giả lập GitHub): quyền tạo kết nối (có và không có mã), sai `state`, đã cấu hình thì từ chối, bí mật được mã hóa và không lộ qua `/state`, manifest cho localhost và HTTPS, `.env` được ưu tiên.
- `make check`.
- Thử giao diện: bàn phím, bố cục 375px, theo DESIGN.md.
- Bấm tạo app thật trên GitHub: **bạn tự bấm**, vì cần tài khoản của bạn.
- Cập nhật README (hợp đồng API, hướng dẫn Planning), ARCHITECTURE.md (bảng mới), `.env.example` (biến `GITHUB_*` là tùy chọn).

Nguồn: [Tạo GitHub App từ manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
