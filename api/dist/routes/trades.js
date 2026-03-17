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
exports.tradesRouter = void 0;
const express_1 = require("express");
const pg_1 = require("pg");
const pgClient = new pg_1.Client({
    connectionString: process.env.DATABASE_URL || "postgres://your_user:your_password@timescaledb:5432/my_database",
});
pgClient.connect();
exports.tradesRouter = (0, express_1.Router)();
exports.tradesRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { market } = req.query;
    const result = yield pgClient.query("SELECT time, price, volume FROM tata_prices ORDER BY time DESC LIMIT 50");
    const dbTrades = result.rows;
    const trades = dbTrades.map((t, index) => {
        let isBuyerMaker = false;
        if (index < dbTrades.length - 1) {
            const currentPrice = Number(t.price);
            const prevPrice = Number(dbTrades[index + 1].price);
            if (currentPrice > prevPrice) {
                isBuyerMaker = false;
            }
            else if (currentPrice < prevPrice) {
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
}));
