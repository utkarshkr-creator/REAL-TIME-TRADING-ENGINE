import { Client } from 'pg';
import { createClient } from 'redis';
import { DbMessage } from './types';
import './cronJob';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});
pgClient.connect();

async function main() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required');
  }
  const redisClient = createClient({
    url: process.env.REDIS_URL,
  });
  await redisClient.connect();
  console.log("connected to redis");

  while (true) {
    const response = await redisClient.rPop("db_processor" as string)
    if (!response) {

    } else {
      const data: DbMessage = JSON.parse(response);
      if (data.type === "TRADE_ADDED") {
        console.log("adding trade data for", data.data.market);
        const price = parseFloat(data.data.price);
        const volume = parseFloat(data.data.quantity);
        const timestamp = new Date(data.data.timestamp);
        const currencyCode = data.data.market || 'TATA_INR';
        const buyerId = data.data.buyerId;
        const sellerId = data.data.sellerId;

        const query = 'INSERT INTO tata_prices (time, price, volume, currency_code, buyer_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6)';
        const values = [timestamp, price, volume, currencyCode, buyerId, sellerId];
        await pgClient.query(query, values);
      } else if (data.type === "ORDER_UPDATE") {
        console.log("adding/updating order details for", data.data.orderId);
        // Uses UPSERT to create new orders or update exact executions on existing ones
        const odata = data.data;
        if (odata.market && odata.price && odata.quantity && odata.side && odata.userId) {
          // This must be a creation event (taker order usually has full info initially)
          const query = `
            INSERT INTO tata_orders (order_id, user_id, market, price, quantity, executed_qty, side, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (order_id) DO UPDATE SET 
              executed_qty = EXCLUDED.executed_qty,
              status = EXCLUDED.status,
              updated_at = CURRENT_TIMESTAMP
          `;
          let status = odata.status || 'open';
          if (odata.executedQty >= parseFloat(odata.quantity)) status = 'filled';
          const values = [odata.orderId, odata.userId, odata.market, parseFloat(odata.price), parseFloat(odata.quantity), odata.executedQty, odata.side, status];
          await pgClient.query(query, values);
        } else {
          // Missing full info, this is likely a partial fill update from the engine on a resting maker order
          const query = `
            UPDATE tata_orders 
            SET executed_qty = $1, 
                status = CASE WHEN $1 >= quantity THEN 'filled' ELSE status END,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = $2
          `;
          await pgClient.query(query, [odata.executedQty, odata.orderId]);
        }
      }
    }
  }
}

main().catch(console.error);