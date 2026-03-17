const { Client } = require('pg');

const client = new Client({
  user: 'your_user',
  host: process.env.DB_HOST || 'localhost',
  database: 'my_database',
  password: 'your_password',
  port: 5432,
});

async function initializeDB() {
  await client.connect();

  // Create extension
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
  `);

  // Drop table if exists
  await client.query(`
    DROP TABLE IF EXISTS "tata_prices" CASCADE;
    DROP TABLE IF EXISTS "tata_orders" CASCADE;
  `);

  // Create tata_prices table
  await client.query(`
    CREATE TABLE "tata_prices"(
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
    CREATE TABLE "tata_orders"(
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

  // Convert tata_prices to a hypertable
  await client.query(`
    SELECT create_hypertable('tata_prices', 'time');
  `);

  // Create materialized views for 1 minute, 1 hour, and 1 week intervals
  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1m AS
    SELECT
        time_bucket('1 minute', time) AS bucket,
        first(price, time) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price, time) AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1h AS
    SELECT
        time_bucket('1 hour', time) AS bucket,
        first(price, time) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price, time) AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1w AS
    SELECT
        time_bucket('1 week', time) AS bucket,
        first(price, time) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price, time) AS close,
        sum(volume) AS volume,
        currency_code
    FROM tata_prices
    GROUP BY bucket, currency_code;
  `);

  await client.end();
  console.log("Database initialized successfully");
}

initializeDB().catch(console.error);