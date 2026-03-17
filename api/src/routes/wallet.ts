import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/auth";
import { RedisManager } from "../RedisManager";
import { BALANCE_UPDATE } from "../utils/types";

export const walletRouter = Router();
const prisma = new PrismaClient();

const DECIMAL_PRECISION = parseInt(process.env.DECIMAL_PRECISION || "6", 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);

walletRouter.get("/balances", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId as string;

        const balances = await prisma.userBalance.findMany({
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
    } catch (error) {
        console.error("Fetch balances error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

walletRouter.post("/deposit", authMiddleware, async (req, res) => {
    try {
        const userId = req.userId as string;
        const { currency, amount } = req.body;

        if (!currency || !amount || amount <= 0) {
            return res.status(400).json({ error: "Invalid currency or amount" });
        }

        const curr = await prisma.currency.findUnique({ where: { code: currency } });
        if (!curr) {
            return res.status(400).json({ error: "Unsupported currency" });
        }

        // Scale up the deposit amount
        const scaledAmount = Math.round(Number(amount) * SCALING_FACTOR);

        // Uses a transaction to either create or increment the balance
        const updatedBalance = await prisma.$transaction(async (tx) => {
            let userBalance = await tx.userBalance.findUnique({
                where: { userId_currencyId: { userId, currencyId: curr.id } }
            });

            if (userBalance) {
                const newAvailable = (BigInt(userBalance.available) + BigInt(scaledAmount)).toString();
                userBalance = await tx.userBalance.update({
                    where: { id: userBalance.id },
                    data: { available: newAvailable }
                });
            } else {
                userBalance = await tx.userBalance.create({
                    data: {
                        userId,
                        currencyId: curr.id,
                        available: scaledAmount.toString(),
                        locked: "0"
                    }
                });
            }
            return userBalance;
        });

        // Send a pub/sub message to the Go engine here 
        // to immediately update its in-memory state.
        await RedisManager.getInstance().sendAndAwait({
            type: BALANCE_UPDATE,
            data: {
                userId,
                currency: curr.code,
                amount: scaledAmount.toString()
            }
        });

        res.json({ message: "Deposit successful", balance: (Number(updatedBalance.available) / SCALING_FACTOR).toString() });
    } catch (error) {
        console.error("Deposit error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
