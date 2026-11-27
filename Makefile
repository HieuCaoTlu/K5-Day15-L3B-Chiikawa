.PHONY: setup up down logs dev-backend dev-frontend test lint format typecheck eval check hooks mock demo

setup:            ## Cài dependency cho cả hai phía + tạo .env
	test -f .env || cp .env.example .env
	cd backend && uv sync
	cd frontend && npm ci

up:               ## Chạy toàn bộ bằng Docker → http://localhost
	docker compose up -d --build --wait

down:
	docker compose down

logs:
	docker compose logs -f --tail 100

dev-backend:      ## FastAPI hot reload → http://localhost:8000/docs
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:     ## Next.js hot reload → http://localhost:3000 (/api tự chuyển sang :8000)
	cd frontend && npm run dev

mock:             ## Backend với MỌI node trả mock data (làm UI không cần agent thật)
	cd backend && MOCK_NODES=all uv run uvicorn app.main:app --reload --port 8000

demo:             ## Backend ưu tiên demo_cache.json (demo không phụ thuộc mạng)
	cd backend && DEMO_MODE=true uv run uvicorn app.main:app --reload --port 8000

test:
	cd backend && uv run pytest

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .

format:
	cd backend && uv run ruff format . && uv run ruff check --fix .

typecheck:
	cd frontend && npm run typecheck

eval:             ## Eval end-to-end ("agent đúng X%")
	cd backend && uv run python eval/run_eval.py

check: lint test typecheck eval   ## Chạy trước khi mở PR

hooks:            ## Bật pre-commit (lint + test phần bị đổi)
	git config core.hooksPath scripts/git-hooks
	chmod +x scripts/git-hooks/pre-commit deploy/*.sh
