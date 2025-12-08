import { Router } from "express";
import { Trade } from "../utils/types";
import { prisma } from "../db";

export const tradesRouter = Router();


tradesRouter.get('/', async (req, res) => {
  const { market } = req.query;
  const dbTrades = await prisma.tataPrice.findMany({
    orderBy: {
      time: 'desc'
    },
    take: 50
  });

  const trades: Trade[] = dbTrades.map((t, index) => {
    let isBuyerMaker = false; // Default to Buy (Green)

    if (index < dbTrades.length - 1) {
      const currentPrice = Number(t.price);
      const prevPrice = Number(dbTrades[index + 1].price);

      if (currentPrice > prevPrice) {
        isBuyerMaker = false; // Price Up -> Buy -> Green
      } else if (currentPrice < prevPrice) {
        isBuyerMaker = true; // Price Down -> Sell -> Red
      }
      // console.log(`Trade ${index}: Cur=${currentPrice} Prev=${prevPrice} Side=${isBuyerMaker ? 'Sell' : 'Buy'}`);
    }

    // Fix volume being 0 in DB
    const volume = t.volume && t.volume > 0 ? t.volume : Math.random() * 10; // Random volume if 0

    return {
      id: Math.random(),
      isBuyerMaker: isBuyerMaker,
      price: t.price.toString(),
      quantity: volume.toFixed(4), // Format to 4 decimals
      quoteQuantity: (Number(t.price) * volume).toString(),
      timestamp: new Date(t.time).getTime()
    };
  });

  res.json(trades);
})

