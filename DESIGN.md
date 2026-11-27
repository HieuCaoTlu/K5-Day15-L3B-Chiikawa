# DESIGN.md — Claude Artifact Tầng

**Chuẩn giao diện của Tầng** là landing và Workstation đang chạy trên website. Quy tắc trong file này áp dụng khi làm màn hình mới hoặc chỉnh giao diện hiện có. Đối chiếu trang thật và mã nguồn khi cần thêm mẫu. [Tầng đang chạy](https://estatesmart.site/) · [HTML Workstation](frontend/public/index.html) · [Token dùng chung](frontend/public/tang/tokens.css) · [CSS Artifact](frontend/public/tang/style.css) · [Màu từng khu vực](frontend/public/tang/data.js)

## 1. Màu và phân cấp

| Token trong Artifact | Giá trị | Vai trò |
|---|---|---|
| Nền | `#fff` | Nền trang, thanh điều hướng, thẻ nổi |
| `--ink` | `#121a33` | Chữ chính, nút chính mặc định |
| `--mute` | `#626d8c` | Mô tả, nhãn phụ, thời gian |
| `--line` | `#e7ebf5` | Viền mảnh, đường phân cách |
| `--soft` | `#f4f6fc` | Nút phụ, ô nhập, nền nhóm nội dung |
| `--indigo` | `#4d5bf0` | Liên kết và viền focus |
| `--blue` | `#0a9cf0` | Product thinking |
| `--green` | `#14b86a` | Planning |
| `--orange` | `#ff8a1f` | Pitching |
| `--indigo` | `#4d5bf0` | Quality. Cùng giá trị với màu liên kết và focus; trong tab Quality, phân biệt bằng chấm màu, chip và dải cạnh thay vì chữ màu |
| `--violet` | `#a24ce8` | Maintaining |
| `--red` / `--yellow` | `#ff4d5e` / `#ffc21a` | Màu phổ Tầng, điểm cảnh báo hoặc điểm nhấn agent |

- Gắn một màu khu vực vào `--c` ở phần tử bao. Dùng chấm màu, thanh tiến độ, dải cạnh hoặc nền nhạt pha 8–13% cho mục đang chọn. Vạch phổ màu mảnh là dấu hiệu nhận diện ở thanh đầu.
- Dùng nền trắng và lớp nền phụ rất nhạt để phân cấp. Thẻ có viền mảnh, không đổ bóng theo mẫu `.panel`. Màu khu vực chỉ chiếm diện tích nhỏ.
- Trạng thái luôn có nhãn tiếng Việt. Chọn màu chữ đủ tương phản trên nền nhạt. Dùng đỏ cho thao tác xóa tiến độ và cảnh báo đến hạn phù hợp với mức độ.
- Khai báo màu dùng chung trong `frontend/public/tang/tokens.css`, rồi dùng biến trong component. Chỉ mở rộng màu khi cần thêm vai trò trong hệ thống.

## 2. Chữ

Dùng **Be Vietnam Pro** với bộ chữ tiếng Việt và fallback hệ thống. Nội dung mặc định 15px, weight 400, line-height 1.6. Nội dung dẫn nhập có thể dùng weight 300.

| Thành phần | Cỡ và weight tham chiếu |
|---|---|
| Tiêu đề landing | `clamp(34px, 4.4vw, 62px)`, 500 |
| Tiêu đề màn Workstation | 25px, 500 |
| Tiêu đề thẻ | 17px, 500 |
| Nhãn phụ, chip, metadata | 12–14px theo mức độ quan trọng |
| Chữ đậm trong nội dung | 500 |

Tiêu đề có line-height khoảng 1.2, tracking âm nhẹ. Chữ đứng, viết hoa đầu câu. Dùng tiếng Việt ngắn và động từ cụ thể cho nút, ví dụ “Kết nối repo” hoặc “Áp dụng kế hoạch”. Định dạng số và ngày theo `vi-VN`.

## 3. Bố cục và component

| Thành phần | Mẫu trên Artifact |
|---|---|
| Thanh đầu | Nền trắng, cao khoảng 62px trên desktop, logo Tầng gọn và vạch phổ mảnh |
| Điều hướng | Nút pill, chấm màu khu vực và nền nhạt cho mục đang chọn. Workstation dùng thanh dưới khi hẹp |
| Bố cục nội dung | Cụm công việc theo `.stack` và `.cols`, gap 18px. Gộp về một cột khi thiếu chỗ |
| Panel | Nền trắng, bo 20px, padding 20px, viền mảnh, không đổ bóng |
| Nút | Dạng pill. Chính dùng nền `--ink`; nhấn theo khu vực dùng tone phù hợp tương phản. Nút phụ dùng `--soft`, ghost có viền mảnh |
| Form | Ô tương tác dùng nền `--soft`, bo 10px, chuyển nền trắng và viền indigo khi focus |
| Chip và trạng thái | Nền pha nhẹ theo màu khu vực hoặc trạng thái. Có tên rõ và không phụ thuộc vào màu để đọc |
| Task | Thẻ trắng bo 12px, dải cạnh màu người phụ trách khi cần. Nhóm task dùng mặt nền `--soft` |
| 3D | Dùng minh họa tòa nhà để diễn đạt các tầng trong landing và Workstation. Avatar 3D là nhận diện thành viên ở Planning |

Trên Workstation, lấy markup và class từ `frontend/public/tang/` làm mẫu. Trên Next.js, dùng lại hành vi của `components/kit/` như `Field`, `Seg`, `StatusChip`, `Modal` và `useConfirm`. Áp dụng hình thức Artifact bằng CSS có phạm vi của trang đang làm. Tab Planning giữ mô hình 3D bên trái trên desktop và hiển thị Tổng quan, Phân vai, User story, sprint và PR trong vùng thao tác bên phải. Nội dung xếp dưới mô hình trên màn hình hẹp. Planning dùng **xanh lá** làm màu khu vực.

## 4. Tương tác và kiểm tra

- Các hiệu ứng vào màn, hover và 3D dùng `transform` hoặc `opacity`. Tôn trọng `prefers-reduced-motion` và giữ đủ nội dung ở trạng thái tĩnh.
- Tại 375px, nội dung chính vừa viewport. Cuộn ngang trong bảng hoặc Kanban khi nội dung cần trải theo cột. Giữ đủ chỗ cho thanh điều hướng dưới và vùng an toàn thiết bị.
- Nút bấm và trường nhập dùng được bằng bàn phím, có nhãn đọc được và focus indigo rõ. Ảnh trang trí dùng `aria-hidden` hoặc `alt=""`.
- Kiểm tra tiêu đề, thẻ và CTA theo thứ tự công việc. Mỗi cụm có một hành động chính dễ thấy. Trạng thái trống và lỗi đưa ra hành động cụ thể.
- So sánh màn hình với Workstation hiện tại ở desktop và mobile, nhất là font, màu khu vực, viền, độ bo và khoảng cách.
