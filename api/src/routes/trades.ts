import { Router } from "express";
import { Trade } from "../utils/types";
import { Client } from "pg";

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://your_user:your_password@timescaledb:5432/my_database",
});
pgClient.connect();

export const tradesRouter = Router();


tradesRouter.get("/", async (req, res) => {
  const { market } = req.query;
  const result = await pgClient.query(
    "SELECT time, price, volume FROM tata_prices ORDER BY time DESC LIMIT 50"
  );
  const dbTrades = result.rows;

  const trades: Trade[] = dbTrades.map((t: any, index: number) => {
    let isBuyerMaker = false;

    if (index < dbTrades.length - 1) {
      const currentPrice = Number(t.price);
      const prevPrice = Number(dbTrades[index + 1].price);

      if (currentPrice > prevPrice) {
        isBuyerMaker = false;
      } else if (currentPrice < prevPrice) {
        isBuyerMaker = true;
      }
    }

    const volume = t.volume && t.volume > 0 ? t.volume : Math.random() * 10;

    return {
      id: Math.random(),
      isBuyerMaker: isBuyerMaker,
      price: t.price.toString(),
      quantity: volume.toFixed(4),
      quoteQuantity: (Number(t.price) * volume).toString(),
      timestamp: new Date(t.time).getTime(),
    };
  });

  res.json(trades);
});

