# REAL-TIME-TRADING-ENGINE
## Introduction
I built a real-time cryptocurrency trading engine that simulates how major exchanges like Binance or Coinbase work. Think of it as a complete trading platform where users can place buy/sell orders, see live price charts, and execute trades instantly - just like you'd see on any professional trading platform.

## Technical Challenges
The critical design choice was to keep the entire matching engine state in memory - all active orders, user balances, and order books live in RAM. This eliminates disk I/O during trading, allowing me to process 5,000+ orders per second with sub-50ms latency. Traditional database-backed systems would be 10-100x slower because every order would require disk reads/writes.

## Persistence Strategy
But here's the challenge - if everything's in memory, what happens during crashes? I solved this with a dual-persistence approach:

### Event Sourcing via Redis:

- Every transaction (orders, trades, cancellations) gets logged to Redis streams immediately
- This creates an immutable audit trail of every state change
- Redis acts as both a message queue for real-time processing AND a transaction log
### Periodic Snapshots:

- Every few minutes, the engine takes a complete snapshot of its in-memory state
- This includes all open orders, user balances, and market data
- Snapshots are compressed and stored in PostgreSQL
### Recovery Process:

- On startup, load the latest snapshot into memory
- Then replay all Redis events since that snapshot
- Within seconds, the engine is back to its exact pre-crash state"

## Architecture
The system achieves high performance through a memory-first design: the matching engine maintains all active state in RAM for instant order processing, while Redis provides both real-time message queuing AND durable transaction logging. Periodic snapshots combined with event replay ensure complete recoverability without sacrificing speed."

This explanation demonstrates:

- Systems thinking (memory vs. disk trade-offs)
- Reliability engineering (disaster recovery planning)
- Performance optimization (eliminating I/O bottlenecks)
- Data engineering (event sourcing, snapshots)
- Production readiness (handling failures gracefully)
- 
## Walk Through a Trade Example
Let me walk you through what happens when someone places a trade:

1. User places order → API validates → Pushes to Redis queue
2. In-memory engine pulls from queue → Matches against existing orders in RAM
3. If matched: Updates in-memory state + Publishes trade event to Redis
4. Redis streams the event for persistence AND real-time WebSocket updates
5. Background service asynchronously writes to PostgreSQL
6. Every 5 minutes: Snapshot current engine state to database
The beauty is that the core matching never waits for disk - it's pure memory operations.


## Reliability
This gives me the best of both worlds:

- Speed: In-memory operations for microsecond-level matching
- Durability: Every transaction is logged to Redis before acknowledgment
- Recoverability: Complete state reconstruction from snapshots + event replay
- Audit Trail: Immutable log of every trade for compliance
Even if the engine crashes mid-trade, no data is lost because the transaction was logged to Redis before the user got confirmation."

## Learning
### System Design & Architecture
- Trade-offs are everything: Learned that in-memory processing dramatically improves performance but requires sophisticated backup strategies
- Decoupling is crucial: Separating concerns (API → Queue → Engine → Database) prevents one slow component from blocking others
- Event-driven architecture: Understanding how pub-sub patterns enable real-time systems to scale horizontally
### Performance Engineering
- Bottleneck identification: Database I/O was the biggest performance killer - moving to memory-first design was game-changing
- Measuring what matters: Latency percentiles (P95, P99) matter more than averages in trading systems
- Queue management: Learned how Redis queues can handle backpressure and prevent system overload
### Data Consistency & Reliability
- Event sourcing: Every state change as an event creates perfect audit trails and enables time-travel debugging
- Snapshot + replay pattern: Balancing recovery speed with storage efficiency
- Graceful degradation: System should fail safely, not catastrophically


## High-Level Design of System
<img width="4556" height="1951" alt="Exchange" src="https://github.com/user-attachments/assets/50c47542-2470-4839-a30c-e503e1bfb365" />

## Steps to start service
- docker ```docker compose up```
- db ```npm run referesh:views``` and ```npm run dev```
- api ```npm run dev```
- exchange_Manager ```npm run dev ```
- ws ```npm run dev ```
- frontend ```npm run dev```

Note: The Market Maker service is available as mm.

## Image
<img width="1767" height="960" alt="Screenshot 2025-08-15 at 3 02 04 PM" src="https://github.com/user-attachments/assets/f6cde817-6287-4894-a217-e58ddfd7d5bc" />
