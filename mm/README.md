# Market Maker (MM) Service

The `mm` script is an automated trading bot built to safely and realistically simulate a live, highly-active cryptocurrency market.

## Responsibilities

1. **Liquidity Provision:** Actively queries the active orderbook (`/api/v1/depth`) and places limit bids and asks evenly around the mid-price to construct a dense, realistic tightening spread.
2. **Order Laddering:** Submits scaled sizes and stepped pricing tiers (up to 10 levels deep) so that large market orders have liquidity to sweep against.
3. **Execution Triggers:** Periodically fires random "Taker" market orders that intentionally cross the spread, triggering the Go engine's execution sequences and updating the live trade feeds and UI price charts.
4. **Inventory Management:** Automatically balances the positions of 5 mock admin users (User `1`, `2`, `3`, `6`, `7`).

## Why it Exists
Without the market maker running, a local instance of the exchange will appear completely static with an empty orderbook. A real exchange relies on hundreds of algorithmic traders to function; this single script mimics that entire ecosystem so the developer can visualize trades.

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the automated simulation:
   ```bash
   npm run dev
   ```
*(Note: Ensure the main Exchange backend services (`api` and `engine`) via `docker-compose up -d` are already running, and that the mock users have been funded via Redis)*

## Environment Variables
- `DECIMAL_PRECISION`: E.g., `6` for `1,000,000` multiplier scale.
- `ADMIN_SECRET`: The authorization secret to bypass standard API logins (`x-admin-secret`).
