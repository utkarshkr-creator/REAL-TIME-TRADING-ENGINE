import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { CANCEL_ORDER, CREATE_ORDER, GET_OPEN_ORDERS } from "../utils/types";
import { authMiddleware } from "../middleware/auth";

export const orderRouter = Router();

const DECIMAL_PRECISION = parseInt(process.env.DECIMAL_PRECISION || '6', 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);
const MAX_ALLOWED_DECIMALS = 5;

function validatePrecision(val: string): boolean {
  const parts = val.split('.');
  if (parts.length > 2) return false;
  if (parts.length === 2 && parts[1].length > MAX_ALLOWED_DECIMALS) return false;
  return true;
}

orderRouter.post('/', authMiddleware, async (req, res) => {
  const { market, price, quantity, side } = req.body;
  const userId = req.userId as string; // from authMiddleware
  const priceStr = price.toString();
  const quantityStr = quantity.toString();

  if (!validatePrecision(priceStr) || !validatePrecision(quantityStr)) {
    return res.status(400).send(`Price and quantity can have at most ${MAX_ALLOWED_DECIMALS} decimal places`);
  }

  const scaledPrice = Math.round(parseFloat(priceStr) * SCALING_FACTOR).toString();
  const scaledQuantity = Math.round(parseFloat(quantityStr) * SCALING_FACTOR).toString();

  const response = await RedisManager.getInstance().sendAndAwait({
    type: CREATE_ORDER,
    data: {
      market,
      price: scaledPrice,
      quantity: scaledQuantity,
      side,
      userId
    }
  });
  res.json(response.payload);
});

orderRouter.delete('/', authMiddleware, async (req, res) => {
  const { market, orderId } = req.body;
  const response = await RedisManager.getInstance().sendAndAwait({
    type: CANCEL_ORDER,
    data: {
      orderId,
      market
    }
  })
  res.json(response.payload);
});

orderRouter.get('/open', authMiddleware, async (req, res) => {
  const response = await RedisManager.getInstance().sendAndAwait({
    type: GET_OPEN_ORDERS,
    data: {
      userId: req.userId as string, // from authMiddleware
      market: req.query.market as string
    }
  });
  res.json(response.payload);
})
