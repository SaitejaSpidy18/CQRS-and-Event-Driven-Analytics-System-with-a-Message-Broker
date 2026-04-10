CREATE TABLE IF NOT EXISTS product_sales_view (
    product_id INTEGER PRIMARY KEY,
    product_name VARCHAR(255),
    category VARCHAR(255),
    total_quantity_sold BIGINT NOT NULL DEFAULT 0,
    total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS category_metrics_view (
    category_name VARCHAR(255) PRIMARY KEY,
    total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_ltv_view (
    customer_id INTEGER PRIMARY KEY,
    total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    last_order_date TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hourly_sales_view (
    hour_timestamp TIMESTAMP PRIMARY KEY,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sync_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_event_timestamp TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO sync_status (id) VALUES (1) ON CONFLICT DO NOTHING;
