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
exports.accountRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const pg_1 = require("pg");
exports.accountRouter = (0, express_1.Router)();
const pgClient = new pg_1.Client({
    connectionString: process.env.DATABASE_URL || "postgres://your_user:your_password@timescaledb:5432/my_database",
});
pgClient.connect();
// Get the logged-in user's orders
exports.accountRouter.get("/orders", auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    try {
        const result = yield pgClient.query(`SELECT order_id, market, price, quantity, executed_qty, side, status, created_at, updated_at
       FROM tata_orders 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`, [userId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error("Failed to fetch user orders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
// Get the logged-in user's trade history
exports.accountRouter.get("/trades", auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    try {
        const result = yield pgClient.query(`SELECT time, price, volume, currency_code, buyer_id, seller_id 
       FROM tata_prices 
       WHERE buyer_id = $1 OR seller_id = $1 
       ORDER BY time DESC 
       LIMIT 100`, [userId]);
        // Map the trades to determine if the user was the buyer or seller for the UI
        const trades = result.rows.map((t) => (Object.assign(Object.assign({}, t), { 
            // If user is buyer_id, their position increased (buy side)
            side: t.buyer_id === userId ? "buy" : "sell" })));
        res.json(trades);
    }
    catch (error) {
        console.error("Failed to fetch user trades:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
