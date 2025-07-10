import { Router } from "express";
import { Trade } from "../utils/types";

export const tradesRouter = Router();


tradesRouter.get('/', async (req, res) => {
  const { market } = req.query;
  //get from db
  const demoData: Trade[] = [
    {
      "id": 10,
      "isBuyerMaker": false,
      "price": "1010",
      "quantity": "1",
      "quoteQuantity": "1",
      "timestamp": 1725284722919
    }
  ]
  res.json({ data: demoData });
})


