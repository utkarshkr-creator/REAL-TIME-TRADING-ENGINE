# Exchange Manager (Matching Engine)

The `exchangeManger` is the absolutely critical core of the trading platform. Built entirely in Go (Golang) for maximum execution speed, this service is responsible for holding the live multi-pair Orderbooks in system RAM and executing millions of match operations asynchronously without ever waiting on a slow database disk write.

## Responsibilities

1. **Order Matching:** Processes Limit, Market, Stop-Loss, IOC (Immediate-Or-Cancel), and Post-Only orders using custom structs.
2. **In-Memory State:** Holds the authoritative `Bids` and `Asks` arrays, completely evaluating whether incoming volume "crosses the spread" and generates a Trade.
3. **Internal Wallet Balances:** Maintains a fast map of User `INR` and `TATA` funds in memory to instantly reject orders for Insufficient Funds, locking capital when an order is resting on the orderbook.
4. **Pub/Sub Publisher:** Immediately broadcasts matched `{trade}`, aggregated `{depth}`, and updating `{ticker}` events straight to Redis so the Node WS Server can pick them up.
5. **Event Sourcing:** Pushes executed fills to a separate `db_processor` Redis queue so the Node Indexer can slowly write them to Postgres while the Go Engine moves on to the next match.

## Tech Stack
- Go 1.21+
- `go-redis`

## Understanding the Decimal Scaling Factor
The Go engine **DOES NOT** use floats for prices or amounts. Floats introduce precision loss (e.g., `0.1 + 0.2 = 0.30000000000000004`). 

To match trades flawlessly, all inputs are multiplied by a `DECIMAL_PRECISION` scalar (default `1,000,000`) before they ever reach the Go Engine.
- `1.5` quantities become integer `1500000`.
- Orders match accurately comparing exact `int64` structs.
- Outputs are generated as scaled strings so they don't break JSON precision. The frontend handles translating these back into floats automatically.

## Setup & Running Locally

1. Go 1.21 must be installed locally.
2. Initialize dependencies:
   ```bash
   go mod tidy
   ```
3. Start the Go matching routine:
   ```bash
   go run cmd/server/main.go
   ```
*(Note: As the matching engine is entirely in-memory, restarting it wipes the orderbook and user balances back to 0. You may need to pipe manual deposits via Redis to resume testing).*

## Environment Variables
- `REDIS_URL`: Connection URL to Redis (e.g. `redis://localhost:6379`)
- `REDIS_ADDR`: Address and Port definition (e.g. `localhost:6379`)
