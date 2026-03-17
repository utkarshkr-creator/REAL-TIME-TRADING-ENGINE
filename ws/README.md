# WebSocket (WS) Service

The `ws` service is the real-time broadcasting hub of the Exchange. Written in Node.js, it manages persistent socket connections for the frontend, pushing live market changes instantly as they happen in the Go Matching Engine.

## Responsibilities

- **Connection Management:** Maintains active WebSocket connections with hundreds/thousands of clients.
- **Redis Pub/Sub Subscription:** Listens to highly active Redis Pub/Sub channels representing different markets and data types (e.g., `trade@TATA_INR`, `depth@TATA_INR`, `ticker@TATA_INR`).
- **Fan-out Broadcasting:** As the Go Engine processes an order and fires a single Redis event, this service routes that exact payload to every specific socket client that subscribed to that specific asset pair.

## Tech Stack
- TypeScript
- `ws` (Node WebSocket library)
- `redis` (Pub/Sub driver)

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Ensure Redis is running locally.
3. Start the server (runs on port `8080`):
   ```bash
   npm run dev
   ```

## Interaction Flow
1. Client connects to `ws://localhost:8080`.
2. Client sends a subscription payload: `{"method":"SUBSCRIBE","params":["trade@TATA_INR"]}`
3. Node server registers the client and subscribes to the `trade@TATA_INR` Redis channel (if not already subscribed).
4. When the Go engine produces a trade, Node converts the Redis buffer and broadcasts the unscaled integers to the client.
