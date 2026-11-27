# Deploy lên VPS + runner riêng của nhóm

Làm một lần, khoảng 15 phút. Sau đó mỗi lần merge vào `main` là tự deploy (thường 1–2 phút).

```
push main ─▶ GitHub Actions ─┬─ backend  (ruff + pytest + eval)   ┐ song song, trên runner của nhóm
                             └─ frontend (npm ci + typecheck)     ┘
                                        │ cả hai xanh
                                        ▼
                             deploy (runner nằm trên VPS)
                               deploy/deploy.sh: thay code ở /opt/hackathon/app (giữ .env, data/)
                               docker compose up -d --build --wait   (cache BuildKit → build lại vài chục giây)
                                        │
Internet ─HTTPS─▶ web (Caddy: HTML tĩnh Next.js + /api) ─▶ backend (FastAPI) ─▶ db (Postgres)
```

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

## 3. Runner riêng của nhóm

Lấy token: repo → **Settings → Actions → Runners → New self-hosted runner** (copy chuỗi sau `--token`).

```bash
sudo bash deploy/setup-runner.sh <owner>/<repo> <token> 2
```

- `runner-1` nhãn `hackathon,deploy`: chạy job deploy (ngay trên VPS, không SSH).
- `runner-2` nhãn `hackathon`: chạy CI song song.
- Laptop/WSL rảnh muốn góp sức chạy CI: `WITH_DEPLOY=0 sudo bash deploy/setup-runner.sh <owner>/<repo> <token> 1`.

Kiểm tra: **Settings → Actions → Runners** thấy các runner trạng thái *Idle*.

## 4. Deploy lần đầu

Push một commit lên `main`, hoặc **Actions → CI/CD → Run workflow**. Xem log: tab Actions hoặc `tail -f /opt/hackathon/deploy.log`.

## Vận hành

| Việc | Lệnh (trên VPS, thư mục `/opt/hackathon/app`) |
|---|---|
| Trạng thái container | `docker compose ps` |
| Log backend / Caddy | `docker compose logs -f --tail 100 backend` / `web` |
| Deploy tay ngay | `cd /opt/hackathon/app && sudo -u deploy bash deploy/deploy.sh` *(cần là thư mục git; thường dùng nút Run workflow)* |
| Bản đang chạy | `cat /opt/hackathon/app/VERSION` |
| Quay lại bản cũ | trên máy: `git revert <commit> && git push` (không sửa tay trên VPS) |
| Vào Postgres | `docker compose exec db psql -U app -d app` |

## Khi runner trên VPS hỏng

1. Repo → **Settings → Secrets and variables → Actions → Variables**: `CI_RUNNER = ubuntu-latest` (CI chạy trên máy GitHub).
2. Deploy qua SSH (giống P-020): tạo key chỉ được chạy `deploy.sh`:
   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/gh-key -C github-actions
   echo "command=\"/opt/hackathon/app/deploy/deploy.sh\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat ~/gh-key.pub)" >> /home/deploy/.ssh/authorized_keys
   ```
   Secrets: `VPS_HOST`, `VPS_SSH_KEY` (`cat ~/gh-key`), `VPS_KNOWN_HOSTS` (`ssh-keyscan <ip>`). Xong xoá `~/gh-key*` trên VPS.
3. **Actions → CI/CD → Run workflow** → tick **via_ssh**.

## Sự cố hay gặp

| Hiện tượng | Cách sửa |
|---|---|
| Job deploy đợi mãi "Waiting for a runner" | Runner nhãn `deploy` chưa chạy: `sudo /opt/actions-runner/runner-1/svc.sh status` |
| `Thiếu /opt/hackathon/app/.env` | Làm bước 2 |
| Không có HTTPS | Bản ghi A chưa trỏ đúng / Cloudflare proxy bật quá sớm; `docker compose logs web` |
| Build hết RAM | Đã có swap 2 GB từ bootstrap; vẫn hết thì giảm số runner xuống 1 |
| `permission denied ... docker.sock` | User runner chưa thuộc nhóm docker: `usermod -aG docker deploy` rồi restart service runner |
