#!/usr/bin/env bash
# Воспроизводит порядок получения result.json из TASK.md на чистой БД:
#   docker compose up -d → migrate → запуск сервиса → POST /sync → вебхуки → daily-totals c_7 (27–31.03).
# Требуется: Docker (образ orders-mock:3 уже загружен: docker load -i ../orders-mock-*.tar.gz), Node 20+, npm install.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=http://localhost:3000
SERVICE_PID=""
cleanup() { [ -n "$SERVICE_PID" ] && kill "$SERVICE_PID" 2>/dev/null || true; }
trap cleanup EXIT

[ -f .env ] || cp .env.example .env

echo "==> чистая БД"
docker compose down -v
docker compose up -d
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
until curl -sf "http://localhost:4000/customers/c_7" >/dev/null; do sleep 1; done

echo "==> миграции и запуск сервиса"
set -a; . ./.env; set +a
npm run migrate
node --import tsx src/server.ts > /tmp/orders-aggregator.log 2>&1 &
SERVICE_PID=$!
until curl -sf "$BASE/health" >/dev/null; do sleep 0.5; done

echo "==> POST /sync (до завершения)"
curl -sf -X POST "$BASE/sync"; echo

echo "==> вебхуки (до завершения)"
docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order

echo "==> daily-totals c_7, 2026-03-27..2026-03-31"
curl -sf "$BASE/customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s),null,2)+"\n"))' > result.json
cat result.json
