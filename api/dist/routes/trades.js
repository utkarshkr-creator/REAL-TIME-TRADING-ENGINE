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
const db_1 = require("../db");
exports.tradesRouter = (0, express_1.Router)();
exports.tradesRouter.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { market } = req.query;
    const dbTrades = yield db_1.prisma.tataPrice.findMany({
        orderBy: {
            time: 'desc'
        },
        take: 50
    });
    const trades = dbTrades.map((t, index) => {
        let isBuyerMaker = false; // Default to Buy (Green)
        if (index < dbTrades.length - 1) {
            const currentPrice = Number(t.price);
            const prevPrice = Number(dbTrades[index + 1].price);
            if (currentPrice > prevPrice) {
                isBuyerMaker = false; // Price Up -> Buy -> Green
            }
            else if (currentPrice < prevPrice) {
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
}));
