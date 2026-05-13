# Real-Time Trading Engine

A high-performance, real-time cryptocurrency exchange simulation built with a microservices architecture. Features a custom ultra-fast matching engine written in Go, supported by Node.js services for REST API, WebSockets, and database indexing.

> **Benchmarked on Apple M3 Pro:**  
> Raw matching engine: **~1.2M order operations/sec** (800–1,077 ns/op)  
> End-to-end system (HTTP → Redis → Engine → Redis → response): **~505 orders/sec** — the bottleneck is I/O and Redis round-trips, not the matching logic


## High-Level System Design

<img width="4556" height="1951" alt="Exchange" src="https://github.com/user-attachments/assets/50c47542-2470-4839-a30c-e503e1bfb365" />

---

## Architecture

The system is split into independent microservices communicating over **Redis Pub/Sub** and **Redis queues**:

| Service | Language | Role |
|---------|----------|------|
| `exchangeManager` | Go 1.23 | Ultra-fast in-memory matching engine (Limit, Market, Stop, IOC, Post-Only orders) |
| `api` | Node.js / Express | REST gateway — validates requests, scales decimals, pushes to Redis |
| `ws` | Node.js / ws | WebSocket server — fans out live trades, depth, ticker to browser clients |
| `db` | Node.js | Background indexer — writes fills & trades from Redis to TimescaleDB |
| `frontend` | Next.js / React | Trading UI — live orderbook, lightweight-charts candlesticks |
| `mm` | TypeScript | Market maker bot — provides liquidity and realistic order flow |

### Key Design Decisions

- **Integer arithmetic only** — all prices/quantities are scaled by `10^6` (`DECIMAL_PRECISION=6`) before entering the Go engine, enabling lossless `int64` matching with zero floating-point error.
- **Redis as IPC bus** — `API → Engine` via `lPush messages`, `Engine → WS` via pub/sub channels (`trade@TATA_INR`, `depth@TATA_INR`, etc.), `Engine → DB` via `lPush db_processor`.
- **Periodic snapshots** — the engine serialises its full in-memory state to disk every 3 seconds for crash recovery.

### Redis Message Flow

```
Client → POST /api/v1/order
           │
           └─ lPush "messages"  ──────────►  Go Engine (BRPop)
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                             publish              lPush          Publish
                        trade@TATA_INR        db_processor   depth@TATA_INR
                                    │               │               │
                                    ▼               ▼               ▼
                              WS Server         DB Indexer     WS Server
                           → Browser client  → TimescaleDB  → Browser client
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker Desktop | Latest |
| Docker Compose | v2+ |
| Node.js | 20+ |
| Go | 1.23+ (only needed for local engine development) |

---

## Running the Full Stack

### Step 1 — Clone and configure

```bash
git clone https://github.com/utkarshkr-creator/REAL-TIME-TRADING-ENGINE.git
cd REAL-TIME-TRADING-ENGINE
```

### Step 2 — Boot all microservices via Docker Compose

```bash
docker compose up -d --build
```

This starts: **TimescaleDB · Redis · Go Engine · API · WebSocket Server · DB Indexer · Frontend**

> First run takes ~2–3 minutes to build images. Subsequent runs use layer cache.

Wait for services to be healthy:

```bash
docker compose ps          # all should show "healthy" or "running"
docker logs engine --tail=5  # should show: "Exchange Engine started. Listening for messages..."
docker logs api    --tail=3  # should show: "Server is listening on port 3006"
```

### Step 3 — Seed currencies (first time only)

The database needs currency rows before deposits can work:

```bash
docker exec timescaledb psql -U your_user -d my_database \
  -c "INSERT INTO \"Currency\" (code, name) VALUES ('INR','Indian Rupee'),('TATA','TATA Stock') ON CONFLICT DO NOTHING;"
```

### Step 4 — Start the Market Maker

The market maker provides liquidity. Without it the orderbook is empty.

```bash
cd mm
npm install
node dist/index.js
```

Expected output (repeating every ~1.5s per user):
```
[MM] Market Maker started | market=TATA_INR mid=~1000 precision=1e6
[MM] mid=137.25 | bids=0(+10) asks=0(+10) | placed=21 | inv[u1]=0.0
[MM] Sent taker trade!
[MM] [u1] Extraneous random simulation TAKER order: BUY 0.00211 @ ~137.94
```

### Step 5 — Open the Frontend UI

```bash
# Option A: already running via Docker on port 3000
open http://localhost:3000

# Option B: run locally for hot-reload during development
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Service URLs

| Service | URL |
|---------|-----|
| Frontend UI | http://localhost:3000 |
| REST API | http://localhost:3006/api/v1 |
| WebSocket | ws://localhost:8080 |
| TimescaleDB | localhost:5432 |
| Redis | localhost:6379 |
| Engine health | http://localhost:8081 |

---

## API Reference (Quick)

All authenticated endpoints require `Authorization: Bearer <token>`.  
Internal services (like the market maker) can bypass auth via `x-admin-secret: super-secret-key-change-me`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/signup` | Register a new user |
| `POST` | `/api/v1/auth/login` | Login, returns JWT |
| `GET`  | `/api/v1/auth/me` | Get current user |
| `POST` | `/api/v1/wallet/deposit` | Deposit INR or TATA |
| `GET`  | `/api/v1/wallet/balances` | Get balances |
| `POST` | `/api/v1/order` | Place an order |
| `DELETE` | `/api/v1/order` | Cancel an order |
| `GET`  | `/api/v1/order/open` | List open orders |
| `GET`  | `/api/v1/depth?symbol=TATA_INR` | Orderbook snapshot |
| `GET`  | `/api/v1/trades?symbol=TATA_INR` | Recent trades |
| `GET`  | `/api/v1/klines?symbol=TATA_INR&interval=1m&startTime=&endTime=` | Candlestick data |
| `GET`  | `/api/v1/tickers` | All market tickers |

---

## Testing & Benchmarking

### End-to-End Test Suite

The project includes a full E2E test and performance benchmark suite in `test/e2e-benchmark.ts`. It covers:

1. **Health Checks** — all HTTP endpoints and WebSocket reachability  
2. **Auth Flow** — signup, login, JWT validation, error cases  
3. **Wallet Flow** — deposit and balance verification  
4. **Order Lifecycle** — maker BUY → maker SELL → taker match → WebSocket trade event → cancel  
5. **Klines & Trade History** — database persistence verification  
6. **Throughput Benchmark** — sequential order submission (orders/sec, p50/p90/p99 latency)  
7. **Concurrent Users** — N users placing orders simultaneously  
8. **WebSocket Latency** — time from `POST /order` → WS event arrives at client  

#### Prerequisites for running tests

```bash
# Install root-level dependencies (axios, ws, ts-node)
npm install
```

Make sure the full stack is running (Steps 1–3 above) before running any tests.

#### Run options

```bash
# Light run — 50 orders, 5 concurrent users (~30s)
npm run bench:light

# Full benchmark — 200 orders, 10 concurrent users (~2 min)
npm run bench

# One-shot script: boots Docker stack + waits for health + runs suite + prints stats
./scripts/run-e2e.sh

# Optional: tear down containers automatically after the run
TEARDOWN=true ./scripts/run-e2e.sh
```

#### Sample benchmark output

```
╔══════════════════════════════════════════════════════════╗
║   REAL-TIME TRADING ENGINE — E2E TEST & BENCHMARK SUITE  ║
╚══════════════════════════════════════════════════════════╝

═══════════════════ SECTION 6 — Throughput ══════════════════
  📊  Submitting 100 sequential limit orders
     Total orders               100
     Total time (ms)            198
     Throughput (orders/s)      505.1
     Avg latency (ms)           2.0
     p50 latency (ms)           2
     p90 latency (ms)           2
     p99 latency (ms)           4
     Min / Max (ms)             1 / 5

═══════════════════ SECTION 7 — Concurrent Users ════════════
  📊  5 users placing orders simultaneously
     Wall-clock time (ms)       9
     Avg latency (ms)           6.8

═══════════════════ SECTION 8 — WS Event Latency ════════════
  📊  POST /order → WS trade/depth event (10 samples)
     Avg (ms)                   60.4
     p50 / p90 / p99 (ms)       55 / 64 / 101

RESULTS:  ✅ 25 passed   ❌ 0 failed   ⏱ 29.2s
```

### Go Engine Unit & Benchmark Tests

```bash
cd exchangeManager
go test ./...                                              # all unit tests
go test ./internal/orderbook/... -v                        # orderbook tests (verbose)
go test -bench=. -benchmem -benchtime=5s ./internal/orderbook/...  # micro-benchmarks
```

**Actual benchmark results (Apple M3 Pro, `benchtime=5s`, 500-deep orderbook):**

```
goos: darwin  goarch: arm64  cpu: Apple M3 Pro

BenchmarkLimitOrderNoMatch-11     10,984,900    797.9 ns/op    757 B/op    2 allocs/op
BenchmarkLimitOrderWithMatch-11    9,412,060   1077.0 ns/op   1118 B/op    5 allocs/op
BenchmarkMarketOrder-11            7,712,347    947.1 ns/op   1135 B/op    5 allocs/op
BenchmarkCancelOrder-11           11,600,904    862.5 ns/op    880 B/op    2 allocs/op
BenchmarkThroughput-11             8,250,774    837.1 ns/op    471 B/op    6 allocs/op
```

| Benchmark | What it measures | ops/sec |
|-----------|-----------------|---------|
| `LimitOrderNoMatch` | Add resting limit order to 500-deep book + O(1) cancel | **~1.25M/s** |
| `LimitOrderWithMatch` | Taker hits best ask (fill + replenish) | **~929K/s** |
| `MarketOrder` | Market sweep against 1,000-deep book + refill | **~1.06M/s** |
| `CancelOrder` | Insert + O(1) cancel via orderID map lookup | **~1.16M/s** |
| `BenchmarkThroughput` | Alternating buy/sell takers against seeded book | **~1.19M/s** |

> The matching engine processes **~800–1,077 ns per operation** in isolation.  
> End-to-end system throughput is ~505 orders/sec — **the bottleneck is Redis I/O, not the matching logic.**

### API TypeScript Tests (future)

```bash
cd api
npm test
```

---

## Development Workflow

### Iterating on a single service

```bash
# Rebuild and restart only the changed service (fast)
docker compose build api && docker compose up -d api

# Or for the Go engine
docker compose build engine && docker compose up -d engine
```

### Viewing logs

```bash
docker compose logs -f engine   # Go matching engine
docker compose logs -f api      # REST API
docker compose logs -f ws       # WebSocket server
docker compose logs -f db       # DB indexer
```

### Resetting state

```bash
# Full reset (drops volumes — clears DB and engine snapshot)
docker compose down -v
docker compose up -d --build

# Clear only the engine snapshot (keeps DB intact)
docker run --rm -v exchange_engine-data:/data alpine rm -f /data/snapshot.json
docker compose restart engine
```

### Market maker configuration (`mm/.env`)

```env
PORT=3002                           # MM health-check HTTP port
BASE_URL=http://localhost:3006      # API base URL
ADMIN_SECRET=super-secret-key-change-me  # Must match JWT_SECRET in API
DECIMAL_PRECISION=6                 # Must match API's DECIMAL_PRECISION
```

> **Important:** `ADMIN_SECRET` must exactly match the `JWT_SECRET` environment variable used by the `api` service (default: `super-secret-key-change-me`).

---

## Screenshot

<img width="1767" height="960" alt="Exchange UI" src="https://github.com/user-attachments/assets/f6cde817-6287-4894-a217-e58ddfd7d5bc" />

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Matching Engine | Go 1.23, `go-redis/v9` |
| REST API | Node.js 20, Express, Prisma, bcryptjs, jsonwebtoken |
| WebSocket | Node.js 20, `ws` library |
| Database | TimescaleDB (PostgreSQL 16), Prisma ORM |
| Message Bus | Redis 7 (Pub/Sub + Lists) |
| Frontend | Next.js 14, React, Tailwind CSS, lightweight-charts |
| Infrastructure | Docker, Docker Compose |
| Market Maker | TypeScript, axios |
