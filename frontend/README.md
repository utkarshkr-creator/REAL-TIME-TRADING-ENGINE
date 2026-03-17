# Frontend UI

The `frontend` is a fully interactive, real-time React application serving as the visualization layer for users of the Exchange.

## Responsibilities

1. **Live Depth Processing:** The UI establishes a fast WebSocket connection (`ws://localhost:8080`) pulling `depth@TATA_INR` diffs as fast as the Go engine can produce them, aggregating them smoothly into Bid and Ask visual tables.
2. **Charting:** Embeds TradingView's `lightweight-charts` to stream live candlestick updates.
3. **Decimal Scaling Normalizer:** The Exchange backend outputs pure scaled integers (`1001000000` instead of `1001.0`). The `frontend` automatically intercepts these on both REST and WebSocket payloads and formats them cleanly (e.g. `.toFixed(4)`) for human consumption.
4. **Auth UX:** Coordinates session storage (JWT) against the `api` Server to validate user access and order history.

## Tech Stack
- Next.js (App Router)
- React
- Tailwind CSS
- `lightweight-charts`

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the React UI server (Runs on port `3000`):
   ```bash
   npm run dev
   ```

## Environment Variables
- `NEXT_PUBLIC_API_URL`: Path to the local API server (defaults to `http://localhost:3006`)
- `NEXT_PUBLIC_WS_URL`: Path to the local internal Node WebSocket broadcasting server (defaults to `ws://localhost:8080`)
- `NEXT_PUBLIC_DECIMAL_PRECISION`: The shared scalar multiplier across all microservices (defaults to `6` to match backend 1e6 assumptions).
