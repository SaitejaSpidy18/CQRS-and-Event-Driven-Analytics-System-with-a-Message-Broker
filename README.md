# CQRS-and-Event-Driven-Analytics-System-with-a-Message-Broker

A high-performance e-commerce analytics backend implementing **CQRS** (Command Query Responsibility Segregation) and an **Event-Driven Architecture** with an outbox pattern and materialized views.

This project powers an analytics dashboard for an e-commerce platform, separating write and read workloads and using asynchronous events to keep read models up to date and **eventually consistent**.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Core Concepts](#core-concepts)
  - [CQRS](#cqrs)
  - [Event-Driven Architecture](#event-driven-architecture)
  - [Outbox Pattern](#outbox-pattern)
  - [Materialized Views](#materialized-views)
- [Services](#services)
- [Data Model](#data-model)
  - [Write Model (Primary DB)](#write-model-primary-db)
  - [Read Model (Analytics Views)](#read-model-analytics-views)
- [Endpoints](#endpoints)
  - [Command Service](#command-service)
  - [Query Service](#query-service)
- [Running the System](#running-the-system)
  - [Prerequisites](#prerequisites)
  - [One-Command Startup](#one-command-startup)
  - [Health Checks](#health-checks)
- [End-to-End Flow](#end-to-end-flow)
- [Testing and Validation](#testing-and-validation)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Design Notes and Trade-offs](#design-notes-and-trade-offs)
- [Future Improvements](#future-improvements)

---

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────┐
│                      Client / Tests                      │
└────────────┬────────────────────────────┬────────────────┘
             │ Writes (port 8080)          │ Reads (port 8081)
             ▼                             ▼
  ┌─────────────────────┐       ┌─────────────────────┐
  │   Command Service   │       │    Query Service    │
  │  POST /api/products │       │  GET /api/analytics │
  │  POST /api/orders   │       └──────────┬──────────┘
  └────────┬────────────┘                  │
           │                                │
           │  Transactions + Outbox         │ Read-only
           ▼                                ▼
  ┌──────────────┐                  ┌──────────────────────┐
  │   Write DB   │                  │       Read DB        │
  │ (PostgreSQL) │                  │    (PostgreSQL)      │
  │ products     │                  │ product_sales_view   │
  │ orders       │                  │ category_metrics_view│
  │ order_items  │                  │ customer_ltv_view    │
  │ outbox ◄─────┼───────┐         │ hourly_sales_view    │
  └──────────────┘       │         └──────────┬───────────┘
                         │                    │
                         │           Updates  │
                         ▼                    ▼
                 ┌──────────────┐    ┌────────────────────┐
                 │   RabbitMQ   │    │  Consumer Service   │
                 │   Broker     │◄───│  (Idempotent)       │
                 └──────────────┘    └────────────────────┘
```

- **Writes** go through the Command Service and are stored in the **write database**.
- Each successful write generates an **event in the outbox table**.
- A background publisher sends these outbox events to **RabbitMQ**.
- The **Consumer Service** listens to events, updates the **read database** materialized views, and tracks processed events for **idempotency**.
- The **Query Service** exposes fast, denormalized **analytics APIs** over the read DB.

---

## Tech Stack

- **Language**: Node.js (Express)
- **Databases**:
  - Write model: PostgreSQL (`db`)
  - Read model: PostgreSQL (`read_db`)
- **Message Broker**: RabbitMQ (with management UI)
- **Containerization**:
  - Docker for each service
  - Docker Compose for orchestration
- **Patterns**:
  - CQRS
  - Event-Driven Architecture
  - Transactional Outbox
  - Materialized Views
  - Idempotent Consumers

---

## Core Concepts

### CQRS

The system separates **commands** (writes) from **queries** (reads):

- **Command Service** writes to a normalized relational model optimized for correctness and transactions.
- **Query Service** reads from denormalized, pre-aggregated tables optimized for analytics queries.

### Event-Driven Architecture

- When commands change state, they emit domain events (`OrderCreated`, `ProductCreated`).
- Events are transported via **RabbitMQ** to loosely coupled consumers.
- Consumers update read models independently, enabling **scalability** and **resilience**.

### Outbox Pattern

- To avoid the *dual-write problem* (DB write succeeds, event publish fails), events are first persisted in an `outbox` table **within the same transaction** as the business data.
- A background **publisher** polls the outbox, publishes messages to RabbitMQ, and marks them as `published_at` once sent.
- This guarantees that every state change that matters for analytics yields a corresponding event.

### Materialized Views

The read database uses tables that act as **materialized views**:

- `product_sales_view`
- `category_metrics_view`
- `customer_ltv_view`
- `hourly_sales_view`

These are updated exclusively by the Consumer Service and designed to answer specific analytics questions **without joins**.

---

## Services

| Service           | Port    | Description                                     |
|-------------------|---------|-------------------------------------------------|
| `command-service` | 8080    | Handles writes (products, orders)              |
| `query-service`   | 8081    | Exposes analytics over materialized views      |
| `consumer-service`| —       | Listens to events, updates read DB             |
| `db`              | 5432    | PostgreSQL write model                         |
| `read_db`         | 5433    | PostgreSQL read model                          |
| `broker`          | 5672/15672 | RabbitMQ + Management UI                    |

---

## Data Model

### Write Model (Primary DB)

**Tables:**

- `products`
  - `id` (PK)
  - `name`
  - `category`
  - `price`
  - `stock`
  - `created_at`
  - `updated_at`

- `orders`
  - `id` (PK)
  - `customer_id`
  - `total`
  - `status`
  - `created_at`

- `order_items`
  - `id` (PK)
  - `order_id` (FK → `orders`)
  - `product_id` (FK → `products`)
  - `quantity`
  - `price`

- `outbox`
  - `id` (UUID or SERIAL PK)
  - `topic` (e.g. `order-events`, `product-events`)
  - `payload` (JSONB)
  - `created_at`
  - `published_at` (nullable)

The Command Service writes to `products` / `orders` / `order_items` and `outbox` in a **single transaction**.

### Read Model (Analytics Views)

**Tables in `read_db`:**

- `product_sales_view`
  - `product_id`
  - `product_name`
  - `category`
  - `total_quantity_sold`
  - `total_revenue`
  - `order_count`
  - `updated_at`

- `category_metrics_view`
  - `category_name`
  - `total_revenue`
  - `total_orders`
  - `updated_at`

- `customer_ltv_view`
  - `customer_id`
  - `total_spent`
  - `order_count`
  - `last_order_date`
  - `updated_at`

- `hourly_sales_view`
  - `hour_timestamp` (start of hour, ISO)
  - `total_orders`
  - `total_revenue`
  - `updated_at`

- `processed_events`
  - `event_id`
  - `processed_at`

- `sync_status`
  - `id` (always 1)
  - `last_processed_event_timestamp`
  - `updated_at`

The Consumer Service ensures **idempotent** updates by checking `processed_events` before processing.

---

## Endpoints

### Command Service

Base URL: `http://localhost:8080`

#### Health

```http
GET /health
200 OK
{"status":"ok"}
```

#### Create Product

```http
POST /api/products
Content-Type: application/json

{
  "name": "Widget Pro",
  "category": "electronics",
  "price": 99.99,
  "stock": 50
}
```

**201 Created**

```json
{
  "productId": 1
}
```

Side effect:

- Row inserted into `products` table.
- `ProductCreated` event inserted into `outbox` with `topic="product-events"`.

#### Create Order

```http
POST /api/orders
Content-Type: application/json

{
  "customerId": 42,
  "items": [
    {
      "productId": 1,
      "quantity": 3,
      "price": 99.99
    }
  ]
}
```

**201 Created**

```json
{
  "orderId": 1001
}
```

Behavior:

- Validates product existence and stock (`SELECT ... FOR UPDATE` for pessimistic locking).
- Deducts stock.
- Inserts `orders` and `order_items`.
- Writes `OrderCreated` event to `outbox` (including enriched product category/name).

---

### Query Service

Base URL: `http://localhost:8081`

#### Health

```http
GET /health
200 OK
{"status":"ok"}
```

#### Product Sales Analytics

```http
GET /api/analytics/products/{productId}/sales
```

**200 OK**

```json
{
  "productId": 1,
  "totalQuantitySold": 6,
  "totalRevenue": 599.94,
  "orderCount": 2
}
```

Backed by `product_sales_view`.

#### Category Revenue Analytics

```http
GET /api/analytics/categories/{category}/revenue
```

Example:

```http
GET /api/analytics/categories/electronics/revenue
```

**200 OK**

```json
{
  "category": "electronics",
  "totalRevenue": 599.94,
  "totalOrders": 2
}
```

Backed by `category_metrics_view`.

#### Customer Lifetime Value

```http
GET /api/analytics/customers/{customerId}/lifetime-value
```

**200 OK**

```json
{
  "customerId": 42,
  "totalSpent": 599.94,
  "orderCount": 2,
  "lastOrderDate": "2026-04-09T13:00:00.000Z"
}
```

Backed by `customer_ltv_view`.

#### Sync Status (Eventual Consistency)

```http
GET /api/analytics/sync-status
```

**200 OK**

```json
{
  "lastProcessedEventTimestamp": "2026-04-09T13:00:05.000Z",
  "lagSeconds": 2.34
}
```

- `lastProcessedEventTimestamp`: last event processed by the Consumer Service.
- `lagSeconds`: approximate delta between current time and last processed event.

---

## Running the System

### Prerequisites

- Docker
- Docker Compose

No local Node.js or PostgreSQL installation is required; everything runs in containers.

### One-Command Startup

From the repository root:

```bash
docker-compose up --build
```

What happens:

- `db` (write PostgreSQL) starts and runs `command-service/init.sql`.
- `read_db` (read PostgreSQL) starts and runs `consumer-service/init_read.sql`.
- `broker` (RabbitMQ) starts with management UI.
- `command-service` starts after `db` and `broker` are healthy.
- `consumer-service` starts after `broker` and `read_db` are healthy.
- `query-service` starts after `read_db` is healthy.

All services define Docker health checks to ensure proper startup order.

### Health Checks

- Command: `GET http://localhost:8080/health`
- Query: `GET http://localhost:8081/health`
- RabbitMQ Management UI: `http://localhost:15672` (default `guest` / `guest`)

---

## End-to-End Flow

1. **Create a product**

   ```bash
   curl -X POST http://localhost:8080/api/products \
     -H "Content-Type: application/json" \
     -d '{"name":"Widget","category":"electronics","price":49.99,"stock":100}'
   ```

2. **Create an order**

   ```bash
   curl -X POST http://localhost:8080/api/orders \
     -H "Content-Type: application/json" \
     -d '{"customerId":42,"items":[{"productId":1,"quantity":3,"price":49.99}]}'
   ```

   - Command Service:
     - Writes `orders` and `order_items`.
     - Writes `OrderCreated` event to `outbox`.

3. **Outbox Publisher**

   - Background process in the Command Service:
     - Polls `outbox` for `published_at IS NULL`.
     - Publishes events to RabbitMQ (`order-events`, `product-events`).
     - Marks `published_at` after successful publish.

4. **Consumer Service**

   - Subscribes to:
     - `order-events` → `OrderCreated`
     - `product-events` → `ProductCreated`
   - For each `OrderCreated`:
     - Updates `product_sales_view`, `category_metrics_view`, `customer_ltv_view`, `hourly_sales_view`.
     - Records `event_id` in `processed_events` (idempotency).
     - Updates `sync_status.last_processed_event_timestamp`.

5. **Query Analytics**

   After a short delay (e.g., 5–10 seconds for tests):

   ```bash
   curl http://localhost:8081/api/analytics/products/1/sales
   curl http://localhost:8081/api/analytics/categories/electronics/revenue
   curl http://localhost:8081/api/analytics/customers/42/lifetime-value
   curl http://localhost:8081/api/analytics/sync-status
   ```

---

## Testing and Validation

A basic **end-to-end test script** is provided:

```bash
bash tests/test_e2e.sh
```

This script:

1. Checks Command and Query service health.
2. Creates a product via the Command Service.
3. Creates an order referencing that product.
4. Waits 10 seconds for async processing.
5. Hits the analytics endpoints and validates aggregated results.

---

## Environment Variables

All variables are documented in `.env.example`:

```env
# Write Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@db:5432/write_db

# Read Database (PostgreSQL)
READ_DATABASE_URL=postgresql://user:password@read_db:5432/read_db

# Message Broker (RabbitMQ)
BROKER_URL=amqp://guest:guest@broker:5672/

# Service Ports
COMMAND_SERVICE_PORT=8080
QUERY_SERVICE_PORT=8081
```

Docker Compose passes these (or equivalent) directly into services via `environment`.

---

## Project Structure

```text
flux-commerce/
├── docker-compose.yml        # Orchestrates all services
├── .env.example              # Documented env vars (no secrets)
├── submission.json           # Configuration for automated evaluation
├── README.md                 # This file
├── command-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql              # Write DB schema + outbox
│   └── src/
│       ├── index.js          # Express app + publisher startup
│       ├── routes.js         # /api/products, /api/orders, /health
│       ├── publisher.js      # Outbox poller → RabbitMQ
│       └── db.js             # pg pool (write DB)
├── consumer-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── init_read.sql         # Read DB schema (materialized views)
│   └── src/
│       ├── index.js          # Connects to broker, subscribes queues
│       ├── handlers.js       # Idempotent event handlers
│       └── db.js             # pg pool (read DB)
├── query-service/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js          # Express app
│       ├── routes.js         # Analytics endpoints + sync-status
│       └── db.js             # pg pool (read DB)
└── tests/
    └── test_e2e.sh           # Simple E2E smoke tests
```

---

## Design Notes and Trade-offs

- **Same technology for read & write DB**  
  Both models use PostgreSQL, but with **separate instances** (`db` and `read_db`). This respects CQRS model separation while keeping deployment simple.

- **Outbox polling vs CDC**  
  A simple polling publisher is used (runs inside the Command Service). In production, you might replace this with CDC (e.g., Debezium) for lower latency and more robust streaming.

- **Idempotency strategy**  
  The Consumer Service stores each processed event’s ID in `processed_events`. Before handling an event, it checks if the ID already exists to guard against at-least-once delivery duplicates.

- **Error handling**  
  Consumers `nack` failing messages without requeue (or route to a dead-letter queue if configured), preventing poison messages from blocking the queue.

- **Granularity of consumers**  
  This implementation uses a single Consumer Service handling all event types. For finer-grained scalability, you could split into multiple micro-consumers per view or per event type.

---

## Future Improvements

- Add additional event types: `PriceChanged`, `StockAdjusted`, `OrderCancelled`.
- Introduce a dedicated **dead-letter queue** for failed events with a dashboard to inspect/replay them.
- Implement **retries with backoff** and structured logging/observability.
- Add more comprehensive **unit tests** and **contract tests** for each service.
- Support additional analytics dimensions (daily/weekly views, cohorts, etc.).
- Add authentication and multi-tenant support.

---

Happy hacking with event-driven CQRS backends!