# flash-sale-api

Flash sale backend — Fastify + TypeScript + Redis, with a React frontend.

## System diagram

```mermaid
flowchart LR
    subgraph Client
        A[React App\nVite + TypeScript]
    end

    subgraph API["API Server (Node.js + Fastify)"]
        B1[GET /sale/status]
        B2[POST /sale/buy]
        B3[GET /sale/order/:userId]
        B4[GET /health]
    end

    subgraph Cache["Redis (Docker)"]
        C1[("sale:config\nhash")]
        C2[("sale:stock\ninteger")]
        C3[("purchase:{userId}\nstring")]
    end

    A -->|"poll every 3s"| B1
    A -->|"{ userId }"| B2
    A --> B3

    B1 --> C1
    B1 --> C2
    B2 --> C1
    B2 -->|"SETNX"| C3
    B2 -->|"DECR / INCR"| C2
    B3 --> C3
```

## Purchase flow

```mermaid
flowchart TD
    START([POST /sale/buy]) --> T{Sale active?}
    T -->|No| E1[400 sale_not_active]
    T -->|Yes| NX{"SETNX\npurchase:{userId}"}
    NX -->|"0 — key exists"| E2[409 already_purchased]
    NX -->|"1 — claimed"| D[DECR sale:stock]
    D --> CHK{result >= 0?}
    CHK -->|Yes| OK[200 success]
    CHK -->|No| RB["INCR sale:stock\nDEL purchase:{userId}"]
    RB --> E3[410 out_of_stock]
```

## Stack

- **Backend:** Node.js, Fastify, TypeScript, ioredis
- **Frontend:** React, TypeScript, Vite
- **Infrastructure:** Redis via Docker

## Setup

```bash
# Start Redis
docker-compose up -d redis

# Backend (runs on :3001)
cd backend && npm install && npm run dev

# Frontend (runs on :5173)
cd frontend && npm install && npm run dev
```

Sale defaults to starting 5 seconds after boot, running for 1 hour, with 100 items. Override with env vars:

```bash
SALE_START="2025-06-01T10:00:00.000Z" SALE_END="2025-06-01T11:00:00.000Z" SALE_STOCK=50 npm run dev
```

## API

| Method | Path                  | Description                     |
| ------ | --------------------- | ------------------------------- |
| GET    | `/sale/status`        | Sale state + remaining stock    |
| POST   | `/sale/buy`           | Purchase attempt `{ userId }`   |
| GET    | `/sale/order/:userId` | Check if user already purchased |
| GET    | `/health`             | Health check                    |

## How concurrency is handled

The main problem is preventing overselling when thousands of requests hit simultaneously. I went with two Redis atomic operations:

1. `SETNX purchase:{userId}` — only one request per user gets through; concurrent duplicates are rejected immediately
2. `DECR sale:stock` — atomic decrement, returns the new value. If it goes negative, we INCR it back and DEL the user key (rollback)

I considered a Lua script to wrap both ops atomically but it felt like overkill here. The rollback path only gets hit when the last few items are claimed, so the window is tiny. A queue approach (BullMQ etc.) would be cleaner for guaranteed ordering but adds latency that would feel bad for users in a flash sale.

No SQL DB — stock is just an integer, purchase records are key-value. Redis is the right fit. If this were production I'd async-persist orders to Postgres for receipts/history, but that's a separate concern from the transaction itself.

## Fault tolerance

- Server won't start if Redis is unreachable — fails loudly on boot rather than silently mid-request
- ioredis is configured with `maxRetriesPerRequest: 3` — transient network blips retry automatically
- If Redis goes down mid-sale, all endpoints return 503 immediately
- Graceful shutdown on SIGTERM/SIGINT — in-flight requests complete before the process exits
- Redis runs with `appendonly yes` — stock and purchase state survive a container restart

## Scalability

The API is stateless — all shared state lives in Redis, so you can run multiple instances behind a load balancer without any coordination. Redis becomes the bottleneck at higher scale; mitigation is Redis Cluster for sharding (keeping `sale:stock` on one shard to preserve atomic DECR) and replica reads for status checks. `GET /sale/status` is also a good CDN caching candidate with a 1-2s TTL.

## Tests

```bash
# Unit (no Redis needed)
npm run test:unit

# Integration (needs Redis running)
npm run test:integration

# Stress — 1000 concurrent connections for 15s
# Start the server first, then:
npm run test:stress
```

The integration test includes a concurrency check: 20 simultaneous buyers for 5 items — exactly 5 should succeed and stock should end at 0, not negative.

The stress test reports p99 latency and confirms no overselling occurred.
