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
exports.walletRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const RedisManager_1 = require("../RedisManager");
const types_1 = require("../utils/types");
exports.walletRouter = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const DECIMAL_PRECISION = parseInt(process.env.DECIMAL_PRECISION || "6", 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);
exports.walletRouter.get("/balances", auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const balances = yield prisma.userBalance.findMany({
            where: { userId },
            include: { currency: true }
        });
        // Format balances for the frontend, scaling down
        const formattedBalances = balances.map(b => ({
            currency: b.currency.code,
            available: (Number(b.available) / SCALING_FACTOR).toString(),
            locked: (Number(b.locked) / SCALING_FACTOR).toString()
        }));
        res.json({ balances: formattedBalances });
    }
    catch (error) {
        console.error("Fetch balances error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
exports.walletRouter.post("/deposit", auth_1.authMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const { currency, amount } = req.body;
        if (!currency || !amount || amount <= 0) {
            return res.status(400).json({ error: "Invalid currency or amount" });
        }
        const curr = yield prisma.currency.findUnique({ where: { code: currency } });
        if (!curr) {
            return res.status(400).json({ error: "Unsupported currency" });
        }
        // Scale up the deposit amount
        const scaledAmount = Math.round(Number(amount) * SCALING_FACTOR);
        // Uses a transaction to either create or increment the balance
        const updatedBalance = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            let userBalance = yield tx.userBalance.findUnique({
                where: { userId_currencyId: { userId, currencyId: curr.id } }
            });
            if (userBalance) {
                const newAvailable = (BigInt(userBalance.available) + BigInt(scaledAmount)).toString();
                userBalance = yield tx.userBalance.update({
                    where: { id: userBalance.id },
                    data: { available: newAvailable }
                });
            }
            else {
                userBalance = yield tx.userBalance.create({
                    data: {
                        userId,
                        currencyId: curr.id,
                        available: scaledAmount.toString(),
                        locked: "0"
                    }
                });
            }
            return userBalance;
        }));
        // Send a pub/sub message to the Go engine here 
        // to immediately update its in-memory state.
        yield RedisManager_1.RedisManager.getInstance().sendAndAwait({
            type: types_1.BALANCE_UPDATE,
            data: {
                userId,
                currency: curr.code,
                amount: scaledAmount.toString()
            }
        });
        res.json({ message: "Deposit successful", balance: (Number(updatedBalance.available) / SCALING_FACTOR).toString() });
    }
    catch (error) {
        console.error("Deposit error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
