# REAL-TIME-TRADING-ENGINE

## Introduction
I built a real-time cryptocurrency trading engine that simulates how major exchanges like Binance or Coinbase work. Think of it as a complete trading platform where users can place buy/sell orders, see live price charts, and execute trades instantly - just like you'd see on any professional trading platform.

## Technical Challenges
The critical design choice was to keep the entire matching engine state in memory - all active orders, user balances, and order books live in RAM. This eliminates disk I/O during trading, allowing me to process 5,000+ orders per second with sub-50ms latency. Traditional database-backed systems would be 10-100x slower because every order would require disk reads/writes.

## Persistence Strategy
But here's the challenge - if everything's in memory, what happens during crashes? I solved this with a dual-persistence approach:

### Event Sourcing via Redis:
- Every transaction (orders, trades, cancellations) gets logged to Redis queues immediately.
- This creates an immutable audit trail of every state change.
- Redis acts as both a message queue for real-time processing AND a transaction log.

### Recovery Process & Snapshots:
- Periodic snapshots (WIP) capture the entire in-memory state.
- On startup, the engine can load the latest snapshot and replay all Redis events since that snapshot.
- Within seconds, the engine is back to its exact pre-crash state.

## Architecture
This project is built using a modern microservices architecture:

1. **`exchangeManger` (Go Matching Engine):** Core ultra-fast matching logic holding state in memory. Processes order queues and publishes trade/depth events.
2. **`api` (Node.js REST API):** Express gateway validating user requests and pushing them to Redis queues.
3. **`ws` (Node.js WebSocket Server):** Subscribes to Redis Pub/Sub channels to fan out live market data (trades, depth, tickers) to the frontend.
4. **`db` (Node.js Indexer):** Background worker that writes filled orders and trades from Redis to TimescaleDB (Postgres) for historical charting.
5. **`frontend` (Next.js):** React-based trading UI featuring live orderbooks and lightweight-charts.
6. **`mm` (TypeScript Market Maker):** An autonomous bot that provides liquidity and realistic order flow to simulate an active market.

*Note: The system scales prices and quantities internally by `1e6` (Decimal Precision) to allow the Go Engine to perform matching operations using absolute `int64` for maximum performance.*

## High-Level Design of System
<img width="4556" height="1951" alt="Exchange" src="https://github.com/user-attachments/assets/50c47542-2470-4839-a30c-e503e1bfb365" />

## Prerequisites
- Node.js 18+ with npm.
- Docker and Docker Compose (used to host all infrastructure and microservices).

## Running the Stack

### 1. Spin up Core Microservices
The entire backend stack forms a Docker compose network. From the root directory, run:
```bash
docker-compose up -d --build
```
This single command spins up:
- TimescaleDB (Postgres)
- Redis
- Go Engine (`engine`)
- API Server (`api`)
- WebSocket Server (`ws`)
- DB Indexer (`db`)

### 2. Run the Market Maker
The market maker script generates order flow. Without it, the exchange visually appears empty.
```bash
cd mm
npm install
npm run dev
```

### 3. Run the Frontend UI
```bash
cd frontend
npm install
npm run dev
```
The trading interface will be available at `http://localhost:3000`.

## Testing & Verification
- `cd api && npm run test` executes API unit tests.
- `cd exchangeManger && go test ./...` runs the Go matching engine tests.
- `cd frontend && npm run lint` checks the UI codebase.

## Screenshot
<img width="1767" height="960" alt="Exchange UI" src="https://github.com/user-attachments/assets/f6cde817-6287-4894-a217-e58ddfd7d5bc" />
