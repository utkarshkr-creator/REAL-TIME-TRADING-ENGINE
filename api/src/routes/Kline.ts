import { Client } from 'pg';
import { Router } from "express";

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});
pgClient.connect();

export const klineRouter = Router();


klineRouter.get("/", async (req, res) => {
  const { symbol, interval, startTime, endTime } = req.query;

  let query;
  switch (interval) {
    case '1m':
      query = `SELECT * FROM klines_1m WHERE bucket >= $1 AND bucket <= $2`;
      break;
    case '1h':
      query = `SELECT * FROM klines_1h WHERE  bucket >= $1 AND bucket <= $2`;
      break;
    case '1w':
      query = `SELECT * FROM klines_1w WHERE bucket >= $1 AND bucket <= $2`;
      break;
    case '1d':
      query = `SELECT 
          time_bucket('1 day', time) AS bucket,
          first(price, time) AS open,
          max(price) AS high,
          min(price) AS low,
          last(price, time) AS close,
          sum(volume) AS volume,
          currency_code
        FROM tata_prices
        WHERE time >= $1 AND time <= $2
        GROUP BY bucket, currency_code`;
      break;
    default:
      return res.status(400).send('Invalid interval');
  }

  try {
    //@ts-ignore
    const result = await pgClient.query(query, [new Date(startTime * 1000 as string), new Date(endTime * 1000 as string)]);
    console.log("result in api", result.rows);

    res.json(result.rows.map(x => ({
      close: x.close,
      end: x.bucket,
      high: x.high,
      low: x.low,
      open: x.open,
      quoteVolume: x?.quoteVolume,
      start: x?.start,
      trades: x?.trades,
      volume: x?.volume,
    })));
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});