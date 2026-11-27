# Planning: nối thật Tổng quan, Phân vai, User story

## Mục tiêu

Giữ bố cục hiện tại. Ba khối dùng dữ liệu thật của đội, lưu trên server để cả đội cùng thấy.

**Không làm đợt này:** File pitching, Tech stack, Chi phí, avatar trên thanh đầu, tên dự án, các tab khác, khung Planning bên dưới.

## Cách làm đã cân nhắc

| Cách | Đánh đổi | Kết quả |
|---|---|---|
| Bỏ ba khối, chỉ giữ Planning thật | Ít việc, mất bố cục và 4 vai | Loại |
| Giữ bố cục, nối dữ liệu thật | Thêm bảng và API | **Đã chọn** |

## Người dùng thấy gì

| Trạng thái | Ba khối |
|---|---|
| Chưa đăng nhập hoặc chưa lưu đội | Trống, kèm một dòng hướng dẫn và nút cuộn xuống phần thiết lập đội |
| Trưởng nhóm | Sửa được. Tự lưu khi rời ô, có chữ "Đã lưu" hoặc thông báo lỗi |
| Thành viên | Chỉ đọc |
| Phiên dùng thử | Như trên, với đội demo của phiên |

- Ban đầu mọi ô đều trống, chỉ có chữ gợi ý. Không còn nội dung mẫu.
- **Phân vai:** giữ 4 vai (Product owner, AI engineer, Full-stack, UX và pitching). Danh sách chọn là thành viên thật. Một người nhận được nhiều vai.
- **User story:** tối đa 12 mục, xóa trống để bỏ.
- Form "Lên sprint cho đội" tự điền Tổng quan và User story đã lưu.
- Đang gõ thì dữ liệu mới từ server không ghi đè ô đó.

## Mở rộng: cả tab Planning dùng dữ liệu thật

Theo yêu cầu "nối thật các dữ liệu thật cho tab Planning". Phần này thay cho mục "Không làm đợt này" ở trên đối với những gì nằm trong tab Planning. Cùng quyền sửa, cách lưu và chống ghi đè như ba khối.

| Phần | Dữ liệu thật |
|---|---|
| File pitching | Giữ danh mục gợi ý. Link do trưởng nhóm dán (`https://`), lưu trên server |
| Tech stack | Bỏ bảng mẫu. Đội tự thêm dòng: hạng mục, lựa chọn, lý do (tối đa 12 dòng) |
| Chi phí | Ô trống ban đầu, nhãn đổi từ "shop" sang "khách". Chỉ số tính ra khi đủ ô cần thiết, thiếu thì hiện "—" |
| Cách kiếm tiền | Bỏ ba thẻ mẫu, thay bằng một ô đội tự ghi (1000 ký tự) |
| Tiến độ tầng Planning | Tính từ đội thật: có repo thì tỉ lệ task xong, chưa có repo thì theo vai đã giao. Chưa có đội là 0% |

`app.js` tự đọc `GET /state` để có dữ liệu cả khi khung chưa mở; khung chỉ báo `tang:planning-changed`. Bảng `planning_boards` gồm `team_id`, `data` (JSON), `version`.

Vẫn là dữ liệu demo vì nằm ngoài tab Planning: tên dự án, avatar trên thanh đầu, các tab khác.

## Mã mời vào đội

Người tạo đội đưa mã cho người khác. Họ đăng nhập bằng tài khoản của mình, nhập mã và vào được đội.

| Ai | Thấy gì |
|---|---|
| Đã đăng nhập, chưa có đội | Hai lựa chọn: **Tạo đội mới** (như hiện nay) hoặc **Nhập mã để vào đội** |
| Người nhập mã | Điền mã và hồ sơ của mình (tên, kinh nghiệm, kỹ năng, avatar). Bấm **Vào đội** là vào ngay với quyền thành viên |
| Trưởng nhóm, tab Thành viên | Thẻ **Mã mời**: tạo mã, sao chép, đổi mã, tắt mã. Thêm nút **Xóa khỏi đội** trên từng thành viên |

Quyết định của tôi:

- **Vào ngay, không chờ duyệt.** Trưởng nhóm xử lý người vào nhầm bằng cách xóa họ và đổi mã.
- Mã 8 ký tự, bỏ các ký tự dễ nhầm (0, O, 1, I), nhập không phân biệt hoa thường, cho phép dấu gạch và khoảng trắng.
- Mã dùng được nhiều lần cho đến khi bị đổi hoặc tắt. Đội mới chưa có mã, trưởng nhóm bấm tạo.
- Mã cho xem toàn bộ sprint, task và PR của đội, nên chỉ trưởng nhóm thấy mã.
- Nhập sai 10 lần trong 10 phút thì phiên đó phải chờ. Giới hạn này tính theo tài khoản, đăng xuất rồi đăng nhập lại không xóa được.
- Giữ các giới hạn hiện có: tối đa 16 người một đội, mỗi tài khoản một đội.
- Xóa thành viên: không xóa được trưởng nhóm. Người còn đứng tên task thì phải giao task cho người khác trước. Người bị xóa mất quyền xem ngay, và vai của họ trong **Phân vai** được để trống.
- Mã mời không cấp quyền trên GitHub. Quyền với repo vẫn quản lý trên GitHub.
- Phiên dùng thử chỉ vào được đội dùng thử, tài khoản GitHub chỉ vào được đội thật. Nhờ vậy có thể thử mã mời trên một máy bằng cửa sổ ẩn danh. Phiên dùng thử thứ hai nhận tên đăng nhập riêng để không trùng người tạo đội.

Kỹ thuật:

- Bảng mới `planning_invites` (`team_id` khóa chính, `code` duy nhất) và `planning_join_attempts` (đếm lần nhập sai theo GitHub ID).
- `POST /planning/invite` tạo hoặc đổi mã, `DELETE /planning/invite` tắt mã (trưởng nhóm).
- `POST /planning/join` nhận `{code, name, experience, tags, avatar}`: 204; 404 mã không đúng; 409 đã có đội hoặc đội đủ người; 429 nhập sai quá nhiều. Tên đăng nhập và ID lấy từ phiên, không nhận từ người gửi.
- `DELETE /planning/members/{github_id}`: 204; 403; 409 nếu là trưởng nhóm hoặc còn task.
- `GET /state` thêm `invite_code`, chỉ trả cho trưởng nhóm.
- Test: vào bằng mã, mã cũ sau khi đổi, đội đầy, đã có đội, giới hạn nhập sai, trộn đội thử với đội thật, thành viên không thấy mã, xóa thành viên.

## Những điểm tôi tự quyết cho ba khối

- **Chỉ trưởng nhóm được sửa**, giống các thao tác ghi khác của Planning.
- **Gợi ý chia vai** so từ khóa trong thẻ kỹ năng và kinh nghiệm của thành viên bằng code, không gọi LLM. Chỉ điền vai đang trống. Vai không ai khớp thì để trống.
- **Đổi repo vẫn giữ** ba khối, vì chúng mô tả dự án.
- **Hai người cùng sửa:** bản lưu cũ bị từ chối (409), giao diện tải bản mới và báo người dùng.
- **Tiến độ tầng Planning:** khi có đội thật, dòng "Chưa giao vai…" dùng vai thật. Chưa có đội thì phần này giữ cách tính demo.
- **Các tab khác** vẫn dùng dữ liệu demo của chúng, gồm cả slide pitching.

## Kỹ thuật

- Bảng mới `planning_boards`: `team_id` (khóa chính), `overview`, `stories` (JSON), `roles` (JSON: vai → GitHub ID), `version`. Dùng bảng mới vì `create_all` không thêm cột vào bảng đã có.
- `GET /api/v1/planning/state` thêm `board: {overview, stories, roles, version}`.
- `PUT /api/v1/planning/board` nhận `{version, overview, stories, roles}`: 204; 403 nếu không phải trưởng nhóm; 409 nếu `version` cũ; 422 nếu tên vai lạ, người không thuộc đội hoặc quá giới hạn (tổng quan 2000 ký tự, story 420).
- `app.js` gọi API trực tiếp, cùng origin và cùng cookie. Lưu xong thì báo khung Planning tải lại. Khung Planning báo ngược khi đội hoặc phiên thay đổi.
- Bỏ đường gửi nội dung mẫu từ Workstation sang khung (`tang:planning-brief`).

## Kiểm tra

- Test API: quyền, `version` cũ, dữ liệu sai, `/state` trả `board`, đổi repo vẫn giữ.
- Chạy lint, test, eval, typecheck.
- Thử trên giao diện bằng phiên dùng thử: trạng thái trống, lưu, tải lại, gợi ý chia vai, form lập sprint tự điền, 375px, bàn phím.
- Cập nhật README (API, bảng DB) và ARCHITECTURE.md.
