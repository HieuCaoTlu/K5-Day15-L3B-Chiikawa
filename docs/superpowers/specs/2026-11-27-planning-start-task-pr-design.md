# Planning: nút "Bắt đầu task" tạo nhánh và PR nháp

## Mục tiêu

Người được giao task bấm một nút trên web là có nhánh `task/t-<số>` và PR nháp mang mã task.

**Không làm đợt này:** viết code cho task, tự merge, tự chuyển PR sang sẵn sàng review, tạo hộ người khác.

## Cách làm đã cân nhắc

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| Mở trang tạo PR trên GitHub | Không cần quyền ghi, nhưng phải tự tạo và đẩy nhánh trước | Loại |
| Một nút tạo nhánh và PR | Cần quyền ghi và xác nhận qua GitHub | **Đã chọn** |

## Người dùng thấy gì

- Nút **Bắt đầu task** trong hộp chi tiết (bảng Task và card Đội).
- Chỉ **người được giao task** thấy nút. PR phải đứng tên họ thì Tầng mới tự liên kết. Ẩn khi task đã xong, đã có PR còn mở, hoặc là đội dùng thử.
- Bấm nút → GitHub xác nhận (thường tự quay lại ngay) → về Tầng, mở sẵn task, có link PR và hai lệnh để chép:
  `git fetch origin` và `git switch task/t-5`.
- Thẻ có nhãn **PR #… nháp** ngay, không đợi lượt đọc nền.

## Quyền trên GitHub

- App cần **Contents: Read and write** và **Pull requests: Read and write**. Người bấm cần quyền ghi vào repo.
- **App bạn đã tạo:** tự sửa quyền ở trang cài đặt app trên GitHub, rồi chấp nhận quyền mới ở trang cài đặt (installation). Tầng không tự sửa được. Khi thiếu quyền, Tầng hiện hướng dẫn và link tới trang đó.
- **Kết nối mới:** manifest xin sẵn hai quyền ghi này (quyết định của tôi; ai không cần nút vẫn bị xin quyền ghi).
- Việc đọc PR (kể cả đọc nền) vẫn dùng token chỉ đọc như hiện nay.

## Thêm thành viên vào repo

Mã mời của Tầng **không** cấp quyền trên GitHub. Mỗi thành viên phải được thêm vào repo riêng.

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| Hướng dẫn thêm tay, Tầng kiểm tra quyền | Trưởng nhóm bấm thêm trên GitHub | **Đề xuất** |
| Tầng tự gửi lời mời | App cần quyền **Administration: write** (quyền quản trị repo, rộng hơn nhiều so với tạo PR). Người được mời **vẫn phải tự chấp nhận** | Chưa chọn |

**Hướng dẫn trong tab Thành viên** (trưởng nhóm thấy):

- Mỗi thành viên có nhãn **Đã có quyền ghi** hoặc **Chưa có quyền ghi**.
- Người chưa có quyền kèm 3 bước: mở `github.com/<repo>/settings/access` (nút bấm) → **Add people** và nhập tên GitHub (nút chép tên) → người đó chấp nhận lời mời trong email hoặc tại `github.com/<repo>/invitations` (link để gửi cho họ).
- Nút **Kiểm tra lại**.
- Người chưa có quyền bấm **Bắt đầu task** thì thấy hướng dẫn chấp nhận lời mời hoặc nhờ trưởng nhóm thêm.

Kỹ thuật: đọc `GET /repos/{repo}/collaborators/{login}/permission` bằng token chỉ đọc của app. **Chưa kiểm chứng** app chỉ có quyền đọc gọi được API này. Nếu không được, vẫn hiện hướng dẫn nhưng bỏ nhãn trạng thái, không đoán.

Repo cá nhân: cộng tác viên được quyền ghi. Repo tổ chức: khi thêm cần chọn mức **Write** trở lên.

## An toàn

- Tạo PR dùng **token của chính người bấm**, dùng trong một lượt rồi bỏ, không lưu, không ghi log.
- Bắt đầu bằng `POST` cùng origin (có header Planning), **không** bắt đầu bằng link `GET`. Nếu không, một link bẫy có thể khiến người đã cấp quyền tạo PR ngoài ý muốn.
- Callback đối chiếu `state` + PKCE như đăng nhập, đúng tài khoản đang đăng nhập, rồi kiểm tra lại: task thuộc đội, người này được giao, repo chưa đổi.
- Chỉ tạo nhánh mới `task/t-<số>`. Không ghi vào `main`, không force, không xóa, không sửa nhánh đã có commit.

## Luồng

1. `POST /api/v1/planning/tasks/{id}/pr` `{repo_version}` → `{url}` trang xác nhận GitHub; mã task nằm trong cookie OAuth.
2. Callback (dùng chung đường dẫn đăng nhập, `intent=pr`):
   - Lấy commit đầu của nhánh theo dõi, tạo nhánh `task/t-<số>`.
   - Thêm một **commit rỗng** để mở được PR, không để lại file nào trong repo. Message: `chore: bắt đầu T-<số>`.
   - Mở PR nháp: tiêu đề `[T-<số>] <tên task>`, mô tả gồm mô tả task và tiêu chí hoàn thành.
   - Ghi PR vào Planning ngay.
3. Về `/planning?github=pr_created&task=<số>`.

## Khi có sự cố

| Tình huống | Xử lý |
|---|---|
| Nhánh đã có, PR còn mở | Không tạo thêm, dẫn tới PR đó |
| Nhánh đã có, chưa có PR, có commit mới so với `main` | Mở PR từ nhánh đó, không sửa nhánh |
| Nhánh đã có, không có commit mới | Thêm commit rỗng rồi mở PR |
| Thiếu quyền app hoặc người dùng không có quyền ghi | Báo rõ và chỉ cách cấp quyền |
| Repo không hỗ trợ PR nháp | Không tự mở PR thường; báo lỗi, giữ nhánh |
| Repo trống | Yêu cầu tạo commit đầu trên nhánh theo dõi |

## Kiểm tra

- Test backend giả lập GitHub: quyền (không phải người được giao, đội dùng thử, task đã xong, đã có PR), `GET` không khởi tạo được, `state` sai, đổi tài khoản, từng tình huống ở bảng trên, token không lọt vào DB hay log.
- **Chưa kiểm chứng:** GitHub có nhận PR chỉ có commit rỗng không. Tôi sẽ cần bạn cấp quyền cho app rồi bấm nút thật trên `ProductPilot-Test`. Nếu GitHub từ chối, đổi sang commit thêm file `.tang/tasks/T-<số>.md` và báo bạn, vì file này sẽ vào `main` khi merge.
- Cập nhật README (API, quyền app).
