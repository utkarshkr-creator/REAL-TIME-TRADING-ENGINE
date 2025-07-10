import { Router } from "express";
import { TickerData } from "../utils/Data/TickerData";
import { Ticker } from "../utils/types";



export const tickerRouter = Router();

tickerRouter.get('/', async (req, res) => {
  const data: Ticker[] = TickerData;
  return res.send({ data });
})
