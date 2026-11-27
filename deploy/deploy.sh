#!/usr/bin/env bash
# Thay code trong $DEPLOY_BASE/app rồi `docker compose up -d --build --wait`. Build lỗi / container không healthy →
# script thoát mã lỗi (job đỏ), container cũ vẫn chạy nếu build hỏng.
#
# Hai cách gọi:
#   1. Runner trên VPS (mặc định, nhanh): workflow chạy `bash deploy/deploy.sh` trong thư mục checkout.
#   2. Dự phòng qua SSH: `git archive --format=tar.gz HEAD | ssh deploy@VPS <sha>`; authorized_keys có
#      command="/opt/hackathon/app/deploy/deploy.sh",no-pty,... (xem deploy/README.md).
#
# .env và data/ trong thư mục app là của VPS, KHÔNG bị ghi đè. Toàn bộ logic nằm trong main để bash đọc hết script
# trước khi bản mới ghi đè chính file này.
set -euo pipefail

main() {
  local base=${DEPLOY_BASE:-/opt/hackathon}
  local app_dir=$base/app
  local version incoming
  mkdir -p "$base" "$app_dir"

  exec > >(tee -a "$base/deploy.log") 2>&1
  exec 9>"$base/deploy.lock"
  flock 9

  incoming=$(mktemp -d "$base/incoming.XXXXXX")
  trap "rm -rf -- '$incoming'" EXIT

  if [[ -n ${SSH_ORIGINAL_COMMAND+x} ]]; then
    version=$SSH_ORIGINAL_COMMAND
    tar -xzf - -C "$incoming"
  else
    version=$(git rev-parse HEAD)
    git -c core.autocrlf=false archive HEAD | tar -x -C "$incoming"
  fi
  [[ $version =~ ^[0-9a-f]{7,40}$ ]] || version=unknown
  echo "=== $(date -Is) deploy ${version:0:12}"

  if [[ ! -f $incoming/docker-compose.yml || ! -f $incoming/deploy/deploy.sh ]]; then
    echo "!!! Gói code không hợp lệ (thiếu docker-compose.yml / deploy/deploy.sh) — huỷ"; exit 1
  fi
  if [[ ! -f $app_dir/.env ]]; then
    echo "!!! Thiếu $app_dir/.env — copy .env.example, điền SITE_ADDRESS, POSTGRES_PASSWORD, GOOGLE_API_KEY…"; exit 1
  fi

  # Thay code, giữ .env + data/. Container cũ vẫn chạy trong lúc này.
  find "$app_dir" -mindepth 1 -maxdepth 1 ! -name .env ! -name data -exec rm -rf {} +
  cp -a "$incoming"/. "$app_dir"/
  echo "$version" > "$app_dir/VERSION"

  cd "$app_dir"
  export DOCKER_BUILDKIT=1 COMPOSE_BAKE=true
  # --wait: chờ healthcheck (backend /health → DB ok). Không healthy trong 180 s → lỗi.
  docker compose up -d --build --remove-orphans --wait --wait-timeout 180
  # Chỉ xoá image lơ lửng; GIỮ build cache để lần sau build nhanh.
  docker image prune -f >/dev/null
  curl -fsS --retry 5 --retry-delay 2 --retry-all-errors "http://127.0.0.1:${BACKEND_PORT:-8000}/health" && echo
  echo "=== $(date -Is) deploy xong ${version:0:12}"
}

main "$@"
