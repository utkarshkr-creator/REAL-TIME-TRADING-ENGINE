# DB Indexer Service

The `db` indexer is a dedicated background worker built with Node.js and Prisma. Its sole responsibility is listening to the Redis `db_processor` queue populated by the Go Matching Engine and asynchronously persisting those highly dense trading events into TimescaleDB.

## Responsibilities

- **Asynchronous Database Writes:** Decouples raw matching speed from database I/O. The Go engine pushes order executions to Redis instantly, and this service processes them at its own pace.
- **Prisma Schema Management:** Owns the `schema.prisma` definitions representing Users, Balances, Orders, and system config.
- **Data Hydration:** Uses PostgreSQL `UPSERT` capabilities to insert new trades (`tata_prices`) and create/update order statuses (`tata_orders`).

## TimescaleDB
Because we are treating trades as a time-series event, we leverage the `timescaledb` PostgreSQL extension. The system runs an automated background script to refresh Continuous Aggregate Views (e.g. `kline_1m`), which calculate candlestick charts natively in the database.

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Make sure TimescaleDB and Redis are running via `docker-compose`.
3. Push Prisma schema:
   ```bash
   npx prisma db push
   ```
4. Start the index processor:
   ```bash
   npm run dev
   ```

## Environment Variables
- `DATABASE_URL`: Connection string to PostgreSQL/TimescaleDB.
- `REDIS_URL`: Connection string to Redis.
