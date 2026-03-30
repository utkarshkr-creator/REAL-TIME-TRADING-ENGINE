"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRouter = void 0;
const express_1 = require("express");
const RedisManager_1 = require("../RedisManager");
const types_1 = require("../utils/types");
const auth_1 = require("../middleware/auth");
exports.orderRouter = (0, express_1.Router)();
const DECIMAL_PRECISION = parseInt(process.env.DECIMAL_PRECISION || '6', 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);
const MAX_ALLOWED_DECIMALS = 5;
function validatePrecision(val) {
    const parts = val.split('.');
    if (parts.length > 2)
        return false;
    if (parts.length === 2 && parts[1].length > MAX_ALLOWED_DECIMALS)
        return false;
    return true;
}
exports.orderRouter.post('/', auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { market, price, triggerPrice, quantity, side, type = 'limit' } = req.body;
    const userId = req.userId; // from authMiddleware
    const priceStr = price ? price.toString() : "0";
    const triggerPriceStr = triggerPrice ? triggerPrice.toString() : "0";
    const quantityStr = quantity.toString();
    if ((type === 'limit' || type === 'stop_limit') && (!validatePrecision(priceStr) || !validatePrecision(quantityStr))) {
        return res.status(400).send(`Price and quantity can have at most ${MAX_ALLOWED_DECIMALS} decimal places`);
    }
    else if ((type === 'market' || type === 'stop_market') && !validatePrecision(quantityStr)) {
        return res.status(400).send(`Quantity can have at most ${MAX_ALLOWED_DECIMALS} decimal places`);
    }
    else if ((type === 'stop_limit' || type === 'stop_market') && !validatePrecision(triggerPriceStr)) {
        return res.status(400).send(`TriggerPrice can have at most ${MAX_ALLOWED_DECIMALS} decimal places`);
    }
    const scaledPrice = (type === 'limit' || type === 'stop_limit') ? Math.round(parseFloat(priceStr) * SCALING_FACTOR).toString() : "0";
    const scaledTriggerPrice = (type === 'stop_limit' || type === 'stop_market') ? Math.round(parseFloat(triggerPriceStr) * SCALING_FACTOR).toString() : "0";
    const scaledQuantity = Math.round(parseFloat(quantityStr) * SCALING_FACTOR).toString();
    const response = yield RedisManager_1.RedisManager.getInstance().sendAndAwait({
        type: types_1.CREATE_ORDER,
        data: {
            market,
            price: scaledPrice,
            triggerPrice: scaledTriggerPrice,
            quantity: scaledQuantity,
            side,
            userId,
            type
        }
    });
    res.json(response.payload);
}));
exports.orderRouter.delete('/', auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { market, orderId } = req.body;
    const response = yield RedisManager_1.RedisManager.getInstance().sendAndAwait({
        type: types_1.CANCEL_ORDER,
        data: {
            orderId,
            market
        }
    });
    res.json(response.payload);
}));
exports.orderRouter.get('/open', auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield RedisManager_1.RedisManager.getInstance().sendAndAwait({
        type: types_1.GET_OPEN_ORDERS,
        data: {
            userId: req.userId, // from authMiddleware
            market: req.query.market
        }
    });
    res.json(response.payload);
}));
