import { Client } from 'pg';
import { createClient } from 'redis';
import { DbMessage } from './types';
import './cronJob';

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://your_user:your_password@localhost:5432/my_database',
});
pgClient.connect();

async function main() {
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  await redisClient.connect();
  console.log("connected to redis");

  while (true) {
    const response = await redisClient.rPop("db_processor" as string)
    if (!response) {

    } else {
      const data: DbMessage = JSON.parse(response);
      if (data.type === "TRADE_ADDED") {
        console.log("adding data");
        console.log(data);
        const price = parseFloat(data.data.price);
        const volume = parseFloat(data.data.quantity);
        const timestamp = new Date(data.data.timestamp);
        const currencyCode = data.data.market || 'TATA_INR';
        const query = 'INSERT INTO tata_prices (time, price, volume, currency_code) VALUES ($1, $2, $3, $4)';
        const values = [timestamp, price, volume, currencyCode];
        await pgClient.query(query, values);
      }
    }
  }
}

main();