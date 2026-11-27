#!/usr/bin/env bash
# Chuẩn bị VPS mới (Ubuntu/Debian), chạy MỘT lần bằng root:
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/deploy/bootstrap-vps.sh | sudo bash
#   (hoặc scp file lên rồi: sudo bash bootstrap-vps.sh)
# Làm: cài Docker, tạo user deploy (nhóm docker), thư mục /opt/hackathon, tường lửa 22/80/443, swap 2 GB (build Next.js
# trên VPS 2 GB RAM hay hết bộ nhớ), bật BuildKit GC để cache không ăn hết đĩa.
set -euo pipefail

BASE=${DEPLOY_BASE:-/opt/hackathon}
USER_NAME=${DEPLOY_USER:-deploy}

[[ $EUID -eq 0 ]] || { echo "Chạy bằng root (sudo)"; exit 1; }

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

id "$USER_NAME" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USER_NAME"
usermod -aG docker "$USER_NAME"
install -d -m 755 -o "$USER_NAME" -g "$USER_NAME" "$BASE" "$BASE/app"
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "/home/$USER_NAME/.ssh"

# Giữ build cache tối đa 10 GB (cache giúp deploy nhanh, nhưng không để đầy đĩa)
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "builder": { "gc": { "enabled": true, "defaultKeepStorage": "10GB" } },
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
JSON
  systemctl restart docker
fi

if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

apt-get install -y -q curl git tar >/dev/null 2>&1 || true

cat <<EOF

Xong. Bước tiếp:
  1. Tạo $BASE/app/.env từ .env.example (SITE_ADDRESS=<tên miền>, POSTGRES_PASSWORD, GOOGLE_API_KEY, APP_ENV=production)
     chown $USER_NAME:$USER_NAME $BASE/app/.env && chmod 600 $BASE/app/.env
  2. Trỏ bản ghi A của tên miền về IP VPS này.
  3. Tạo key SSH + secrets VPS_HOST / VPS_SSH_KEY / VPS_KNOWN_HOSTS cho GitHub Actions (xem deploy/README.md, mục 3)
EOF
