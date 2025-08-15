import { Router } from "express";

import { RedisManager } from "../RedisManager";

import { GET_BALANCE, GET_DEPTH } from "../utils/types";

export const depthRouter = Router();
depthRouter.get('/', async (req, res) => {
    const { symbol } = req.query;
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_DEPTH,
        data: {
            market: symbol as string
        }
    })
    res.json(response.payload);
})

depthRouter.get('/balance', async (req, res) => {
    const userId = req.query.userId as string;
    const quoteAsset = req.query.quoteAsset as string;
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_BALANCE,
        data: {
            userId,
            quoteAsset
        }
    })
    res.json(response.payload);
})

depthRouter.get('/price', async (req, res) => {
    const userId = req.query.userId as string;
    const quoteAsset = req.query.quoteAsset as string;
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_BALANCE,
        data: {
            userId,
            quoteAsset
        }
    })
    res.json(response.payload);
})