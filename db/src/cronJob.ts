import { Client } from 'pg';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
client.connect();

async function refreshViews() {

  await client.query('REFRESH MATERIALIZED VIEW klines_1m');
  await client.query('REFRESH MATERIALIZED VIEW klines_1h');
  await client.query('REFRESH MATERIALIZED VIEW klines_1w');

  console.log("Materialized views refreshed successfully");
}

refreshViews().catch(console.error);

setInterval(() => {
  refreshViews()
}, 1000 * 10);