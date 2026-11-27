#!/usr/bin/env bash
# Cài GitHub Actions runner RIÊNG của nhóm, mỗi runner một service systemd, chạy bằng user deploy.
#
#   sudo bash deploy/setup-runner.sh <owner/repo> <registration-token> [số-runner=2]
#
# Lấy token (hết hạn sau 1 giờ): repo → Settings → Actions → Runners → New self-hosted runner
#   hoặc: gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token
#
# Nhãn:
#   runner-1: self-hosted, hackathon, deploy   ← job deploy chỉ chạy ở đây (trên VPS)
#   runner-2..N: self-hosted, hackathon        ← CI chạy song song (backend + frontend cùng lúc)
# Máy khác (laptop rảnh, WSL) muốn góp sức chạy CI: WITH_DEPLOY=0 bash setup-runner.sh … → chỉ nhận nhãn hackathon.
#
# VPS 2 vCPU: 2 runner là vừa. 4 vCPU: 3.
set -euo pipefail

REPO=${1:?Thiếu <owner/repo>}
TOKEN=${2:?Thiếu <registration-token>}
COUNT=${3:-2}
RUNNER_USER=${RUNNER_USER:-deploy}
WITH_DEPLOY=${WITH_DEPLOY:-1}
BASE=/opt/actions-runner

[[ $EUID -eq 0 ]] || { echo "Chạy bằng root (sudo)"; exit 1; }
id "$RUNNER_USER" >/dev/null 2>&1 || { echo "Chưa có user $RUNNER_USER — chạy deploy/bootstrap-vps.sh trước"; exit 1; }

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Kiến trúc chưa hỗ trợ: $(uname -m)"; exit 1 ;;
esac

VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
[[ -n $VERSION ]] || { echo "Không lấy được phiên bản runner mới nhất"; exit 1; }
TARBALL=$BASE/actions-runner-linux-$ARCH-$VERSION.tar.gz

install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$BASE"
[[ -f $TARBALL ]] || curl -fsSL -o "$TARBALL" \
  "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz"

for i in $(seq 1 "$COUNT"); do
  dir=$BASE/runner-$i
  if [[ -f $dir/.runner ]]; then
    echo "runner-$i đã cài — bỏ qua"; continue
  fi
  install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$dir"
  tar -xzf "$TARBALL" -C "$dir"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$dir"
  "$dir/bin/installdependencies.sh" >/dev/null

  labels=hackathon
  [[ $i -eq 1 && $WITH_DEPLOY == 1 ]] && labels=hackathon,deploy

  sudo -u "$RUNNER_USER" "$dir/config.sh" --unattended --replace \
    --url "https://github.com/$REPO" --token "$TOKEN" \
    --name "$(hostname)-$i" --labels "$labels" --work _work
  (cd "$dir" && ./svc.sh install "$RUNNER_USER" && ./svc.sh start)
  echo "runner-$i: nhãn $labels"
done

echo "Xong. Kiểm tra: repo → Settings → Actions → Runners (trạng thái Idle)."
