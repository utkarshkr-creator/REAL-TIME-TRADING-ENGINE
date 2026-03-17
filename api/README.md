# API Service

The `api` service is the central REST gateway for the Exchange platform. Built with Node.js and Express, it serves as the entry point for all frontend requests, managing user authentication, HTTP validations, and acting as the bridge between standard web clients and the high-speed Redis message queues.

## Responsibilities

- **Authentication:** Handles user registration, login, and JWT-based session validation (`/auth/*`).
- **REST Endpoints:** Exposes orderbook snapshots (`/depth`), recent market trades (`/trades`), and historical candlestick data (`/klines`).
- **Queue Publisher:** Instead of talking directly to a database for order matching, the API authenticates a trade request and pushes it to the generic `messages` Redis queue where the Go Engine picks it up.
- **Scaling Factor:** Human-readable values (like `1.5 TATA` or `1005.50 INR`) are scaled up strictly by `process.env.DECIMAL_PRECISION` (default `1e6`) before being dispatched to the Go internal exchange.

## Tech Stack
- Typescript
- Express.js
- Redis (`redis` npm package)
- Zod (Request validation)

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Make sure Redis and TimescaleDB are running (via `docker-compose up -d` in the project root).
3. Start the server (runs on port `3006`):
   ```bash
   npm run dev
   ```

## Environment Variables
- `DATABASE_URL`: Connection string to TimescaleDB
- `REDIS_URL`: Connection string to Redis
- `JWT_SECRET`: Secret key for signing Auth tokens
- `DECIMAL_PRECISION`: E.g., `6` for `1,000,000` multiplier scale.
