const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function initializeDB() {
  await client.connect();

  // Removed timescaledb extension requirement

  // Removed DROP TABLE to make this safe to run on startup

  // Create tata_prices table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "tata_prices"(
        time            TIMESTAMP WITH TIME ZONE NOT NULL,
        price           DOUBLE PRECISION,
        volume          DOUBLE PRECISION,
        currency_code   VARCHAR(10),
        buyer_id        VARCHAR(255),
        seller_id       VARCHAR(255)
    );
  `);

  // Create tata_orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "tata_orders"(
        order_id      VARCHAR PRIMARY KEY,
        user_id       VARCHAR NOT NULL,
        market        VARCHAR NOT NULL,
        price         DOUBLE PRECISION NOT NULL,
        quantity      DOUBLE PRECISION NOT NULL,
        executed_qty  DOUBLE PRECISION NOT NULL DEFAULT 0,
        side          VARCHAR NOT NULL,
        status        VARCHAR NOT NULL DEFAULT 'open',
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create standard index on time instead of hypertable
  await client.query(`
    CREATE INDEX IF NOT EXISTS "idx_tata_prices_time" ON "tata_prices" (time);
  `);

  // Create materialized views for 1 minute, 1 hour, and 1 week intervals
  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1m AS
    SELECT
        date_trunc('minute', time) AS bucket,
        (array_agg(price ORDER BY time ASC))[1] AS open,
        max(price) AS high,
        min(price) AS low,
        (array_agg(price ORDER BY time DESC))[1] AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1h AS
    SELECT
        date_trunc('hour', time) AS bucket,
        (array_agg(price ORDER BY time ASC))[1] AS open,
        max(price) AS high,
        min(price) AS low,
        (array_agg(price ORDER BY time DESC))[1] AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1w AS
    SELECT
        date_trunc('week', time) AS bucket,
        (array_agg(price ORDER BY time ASC))[1] AS open,
        max(price) AS high,
        min(price) AS low,
        (array_agg(price ORDER BY time DESC))[1] AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.end();
  console.log("Database initialized successfully");
}

initializeDB().catch(console.error);