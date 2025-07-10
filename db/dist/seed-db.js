"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { Client } = require('pg');
const client = new Client({
    user: 'your_user',
    host: 'localhost',
    database: 'my_database',
    password: 'your_password',
    port: 5432,
});
function initializeDB() {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.connect();
        // Drop table if exists
        yield client.query(`
    DROP TABLE IF EXISTS "tata_prices" CASCADE;
  `);
        // Create tata_prices table
        yield client.query(`
    CREATE TABLE "tata_prices"(
        time            TIMESTAMP WITH TIME ZONE NOT NULL,
        price           DOUBLE PRECISION,
        volume          DOUBLE PRECISION,
        currency_code   VARCHAR(10)
    );
  `);
        // Convert tata_prices to a hypertable
        yield client.query(`
    SELECT create_hypertable('tata_prices', 'time');
  `);
        // Create materialized views for 1 minute, 1 hour, and 1 week intervals
        yield client.query(`
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
        yield client.query(`
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
        yield client.query(`
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
        yield client.end();
        console.log("Database initialized successfully");
    });
}
initializeDB().catch(console.error);
