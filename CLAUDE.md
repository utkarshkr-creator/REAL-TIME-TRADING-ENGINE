# Exchange Project Context

This is a high-performance, real-time cryptocurrency exchange simulation built with a microservices architecture. It features a custom ultra-fast matching engine built in Go, supported by Node.js services for API routing, WebSockets, and Database indexing.

## Architecture & Services

The project is split into several independent microservices communicating primarily via Redis Pub/Sub and Queues:

1. **`exchangeManger` (Go Matching Engine):** 
   - Core order matching logic (Limit, Market, Stop-Limit, Stop-Market, IOC, Post-Only).
   - In-memory orderbooks holding state structure.
   - Listens to the `messages` Redis queue (LPOP) for incoming orders and balance updates.
   - Publishes trades, depths, and ticker data to Redis Pub/Sub.
   - Publishes DB persistence messages to Redis queues (`db_processor`).

2. **`api` (Node.js REST API):** 
   - Handles HTTP requests from the frontend UI.
   - Authenticates users via JSON Web Tokens (JWT).
   - Validates parameters and injects scaling factor logic (translating human-readable INR/TATA into integers for Go).
   - Pushes user "deposits" and "Orders" straight to the Redis `messages` queue.

3. **`ws` (Node.js WebSocket Server):**
   - Manages live socket connections for the Frontend UI on port `8080`.
   - Subscribes to Redis Pub/Sub channels (e.g. `depth@TATA_INR`, `trade@TATA_INR`, `ticker@TATA_INR`).
   - Forwards Redis messages down to connected browser clients for real-time orderbook, chart, and trade rendering.

4. **`db` (Node.js Indexer) & `db_processor` (Klines API):**
   - **`db`**: Background worker that listens to the `db_processor` Redis queue and asynchronously writes filled orders and trades into TimescaleDB using Prisma.
   - **`db_processor`**: A work-in-progress Express API service intended to serve K-line (candlestick) data.

5. **`frontend` (Next.js / React UI):**
   - Interactive trading UI using `tailwindcss` and `lightweight-charts`.
   - Tracks live orderbooks (Bid/Ask tables) and dynamic premium K-line candlesticks.

6. **`mm` (TypeScript Market Maker):**
   - An autonomous bot script that injects liquidity into the exchange.
   - Continuously places limit bids/asks to generate a realistic tightening spread orderbook.
   - Periodically fires "Taker" crossed-spread market orders to trigger execution logic and keep the price chart moving.
   - Needs to be run manually via `npm run dev` inside `/mm`.

## Tech Stack
- **Languages Options:** Go 1.21+, TypeScript, Node.js (v20+)
- **Databases:** Redis (for IPC/PubSub), TimescaleDB / PostgreSQL (Persistence)
- **Frontend:** Next.js, React, Tailwind CSS, Lightweight Charts
- **Infrastructure:** Docker & Docker Compose

## Critical Design Patterns

### Decimal Precision Scaling Factor
The Go matching engine uses absolute `int64` for maximum computational speed to match orders. 
- All incoming prices and quantities via the API are multiplied by a `SCALING_FACTOR` (currently `1e6` or `1,000,000`).
- This means `1 TATA @ 1000 INR` is processed by Go as quantity `1,000,000` at price `1,000,000,000`.
- The frontend and API automatically divide and scale these values back down by `1e6` when parsing WebSocket events (`Trades.tsx`, `Depth.tsx`, `ChartManager.ts`).

### Redis Message Flow
- **API -> Engine:** Redis `lPush` to `messages` queue.
- **Engine -> WebSocket:** Redis `publish` to `trade@<market>`, `depth@<market>`.
- **Engine -> DB:** Redis `lPush` to `db_processor` queue.

## Run Instructions

### 1. Spin up Core Microservices
Use Docker Compose from the root directory to build and spin up the database, redis, ws, api, db, and Go engine.
```bash
docker-compose up -d --build
```
*Note: Ensure to use `docker-compose restart <service>` or `--build <service>` if iterating on specific containers.*

### 2. Run Market Maker
The market maker script simulates active trading. Without it, the exchange is a ghost town.
```bash
cd mm
npm run dev
```
*(Optionally) if the Go Engine was restarted, you may need to run `node fund.js` inside `/ws` or `/mm` to manually insert funds into the mocked Redis user accounts so the MM orders do not get rejected for Insufficient Funds.*

### 3. Run Frontend
```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`.
