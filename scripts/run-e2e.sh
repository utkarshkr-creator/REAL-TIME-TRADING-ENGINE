#!/usr/bin/env bash
# ============================================================
#  run-e2e.sh — Boot the Exchange stack & run E2E benchmark
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="http://localhost:3006/api/v1"
WS_URL="ws://localhost:8080"
BENCH_ORDERS="${BENCH_ORDERS:-200}"
BENCH_CONCURRENCY="${BENCH_CONCURRENCY:-10}"
TEARDOWN="${TEARDOWN:-false}"   # set TEARDOWN=true to stop containers after run

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[run-e2e]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ FAIL ]${NC} $*"; }

# ── 1. Build & start containers ─────────────────────────────
log "Starting Docker Compose stack (build if needed)…"
cd "$ROOT"
docker compose up -d --build 2>&1 | tail -20
ok "docker compose up issued"

# ── 2. Wait for API health ───────────────────────────────────
log "Waiting for API to become healthy at ${API_URL}/tickers …"
WAIT=0; MAX=120
until curl -sf "${API_URL}/tickers" > /dev/null 2>&1; do
    if [ $WAIT -ge $MAX ]; then
        err "API did not become healthy within ${MAX}s"
        docker compose logs api | tail -30
        exit 1
    fi
    printf "."
    sleep 2
    WAIT=$((WAIT + 2))
done
echo ""
ok "API is healthy (waited ${WAIT}s)"

# ── 3. Wait for WebSocket ────────────────────────────────────
log "Waiting for WebSocket server at port 8080…"
WAIT=0
until nc -z localhost 8080 2>/dev/null; do
    if [ $WAIT -ge 30 ]; then
        err "WebSocket did not come up within 30s"; exit 1
    fi
    sleep 1; WAIT=$((WAIT + 1))
done
ok "WebSocket is reachable"

# ── 4. Print live container status ──────────────────────────
log "Container status:"
docker ps --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}"

# ── 5. Run the benchmark suite ──────────────────────────────
log "Running E2E test + performance benchmark…"
echo ""
cd "$ROOT"
API_URL="$API_URL" \
WS_URL="$WS_URL" \
BENCH_ORDERS="$BENCH_ORDERS" \
BENCH_CONCURRENCY="$BENCH_CONCURRENCY" \
npx ts-node --project tsconfig.json test/e2e-benchmark.ts
SUITE_EXIT=$?

# ── 6. Capture Docker stats snapshot ────────────────────────
echo ""
log "Docker resource usage snapshot:"
docker stats --no-stream --format \
    "  {{.Name}}\tCPU: {{.CPUPerc}}\tMEM: {{.MemUsage}}\tNET I/O: {{.NetIO}}"

# ── 7. Optional teardown ─────────────────────────────────────
if [ "$TEARDOWN" = "true" ]; then
    log "Tearing down containers (TEARDOWN=true)…"
    docker compose down
    ok "Stack stopped"
else
    warn "Containers left running. Set TEARDOWN=true to stop them automatically."
fi

# ── 8. Exit with suite's exit code ──────────────────────────
if [ $SUITE_EXIT -eq 0 ]; then
    ok "All tests passed 🎉"
else
    err "Some tests failed — see output above"
fi
exit $SUITE_EXIT
