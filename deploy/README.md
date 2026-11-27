# Deploy lên VPS bằng GitHub Actions

Làm một lần, khoảng 15 phút. Sau đó mỗi lần merge vào `main` là tự deploy.

```
push main ─▶ GitHub Actions ─┬─ backend  (ruff + pytest + eval)   ┐ song song, trên máy GitHub
                             └─ frontend (npm ci + typecheck)     ┘
                                        │ cả hai xanh
                                        ▼
                             deploy (máy GitHub → SSH vào VPS)
                               git archive HEAD | ssh deploy@VPS <commit>
                               deploy/deploy.sh: thay code ở /opt/hackathon/app (giữ .env, data/)
                               docker compose up -d --build --wait   (cache BuildKit trên VPS)
                                        │
Internet ─HTTPS─▶ web (Caddy: HTML tĩnh Next.js + /api) ─▶ backend (FastAPI) ─▶ db (Postgres)
```

Chưa cấu hình secrets (bước 3) thì job deploy tự bỏ qua và ghi cảnh báo, CI vẫn xanh.

## 1. Chuẩn bị VPS (root, một lần)

```bash
scp deploy/bootstrap-vps.sh root@<ip>:/root/ && ssh root@<ip> 'bash /root/bootstrap-vps.sh'
```

Cài Docker, tạo user `deploy`, thư mục `/opt/hackathon/app`, tường lửa 22/80/443, swap 2 GB, giới hạn build cache 10 GB.

## 2. File `.env` trên VPS

```bash
sudo -u deploy nano /opt/hackathon/app/.env      # dán nội dung .env.example rồi sửa:
#   SITE_ADDRESS=app.ten-mien.com
#   SITE_URL=https://app.ten-mien.com
#   APP_ENV=production
#   POSTGRES_PASSWORD=<chuỗi ngẫu nhiên>
#   GOOGLE_API_KEY=<key RIÊNG cho bản demo>
chmod 600 /opt/hackathon/app/.env
```

Trỏ bản ghi A của tên miền về IP VPS (Cloudflare: để **DNS only** lúc đầu cho Caddy xin chứng chỉ, sau đó mới bật proxy và đặt SSL mode = Full).

## 3. Cho GitHub Actions SSH vào VPS

Tạo một key **chỉ được chạy `deploy.sh`** (không mở shell). Trên VPS:

```bash
# Chép deploy.sh lên VPS một lần để key dùng được ngay (từ lần deploy sau, script tự cập nhật theo code):
#   (trên máy bạn)  scp deploy/deploy.sh root@<ip>:/opt/hackathon/app/deploy/deploy.sh   # tạo thư mục deploy/ trước nếu chưa có
chmod +x /opt/hackathon/app/deploy/deploy.sh && chown -R deploy:deploy /opt/hackathon/app/deploy

ssh-keygen -t ed25519 -N "" -f ~/gh-key -C github-actions
echo "command=\"/opt/hackathon/app/deploy/deploy.sh\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat ~/gh-key.pub)" >> /home/deploy/.ssh/authorized_keys
```

Repo → **Settings → Secrets and variables → Actions → Secrets**, thêm:

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP hoặc tên miền VPS |
| `VPS_SSH_KEY` | `cat ~/gh-key` (khoá **riêng**, cả khối `-----BEGIN…END-----`) |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan <ip>` (chạy trên máy bạn) |

Xong thì **xoá `~/gh-key*` trên VPS**.

## 4. Deploy lần đầu

Push một commit lên `main`, hoặc **Actions → CI/CD → Run workflow**. Xem log: tab Actions hoặc `tail -f /opt/hackathon/deploy.log`.

## Vận hành

| Việc | Lệnh (trên VPS, thư mục `/opt/hackathon/app`) |
|---|---|
| Trạng thái container | `docker compose ps` |
| Log backend / Caddy | `docker compose logs -f --tail 100 backend` / `web` |
| Deploy lại | Actions → CI/CD → Run workflow (trên `main`) |
| Bản đang chạy | `cat /opt/hackathon/app/VERSION` |
| Quay lại bản cũ | trên máy: `git revert <commit> && git push` (không sửa tay trên VPS) |
| Vào Postgres | `docker compose exec db psql -U app -d app` |

## Sự cố hay gặp

| Hiện tượng | Cách sửa |
|---|---|
| Job deploy chỉ ghi cảnh báo, không deploy | Chưa đủ 3 secrets `VPS_*` — làm bước 3 |
| `Permission denied (publickey)` | Sai `VPS_SSH_KEY`, hoặc dòng `authorized_keys` của user `deploy` chưa đúng |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` sai / VPS đổi host key — chạy lại `ssh-keyscan` |
| `Thiếu /opt/hackathon/app/.env` | Làm bước 2 |
| Không có HTTPS | Bản ghi A chưa trỏ đúng / Cloudflare proxy bật quá sớm; `docker compose logs web` |
| Build hết RAM | Đã có swap 2 GB từ bootstrap; vẫn hết thì nâng RAM VPS |
