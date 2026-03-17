import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { Client } from "pg";

export const accountRouter = Router();

const pgClient = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://your_user:your_password@timescaledb:5432/my_database",
});
pgClient.connect();

// Get the logged-in user's orders
accountRouter.get("/orders", authMiddleware, async (req: any, res) => {
    const userId = req.userId;

    try {
        const result = await pgClient.query(
            `SELECT order_id, market, price, quantity, executed_qty, side, status, created_at, updated_at
       FROM tata_orders 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Failed to fetch user orders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get the logged-in user's trade history
accountRouter.get("/trades", authMiddleware, async (req: any, res) => {
    const userId = req.userId;

    try {
        const result = await pgClient.query(
            `SELECT time, price, volume, currency_code, buyer_id, seller_id 
       FROM tata_prices 
       WHERE buyer_id = $1 OR seller_id = $1 
       ORDER BY time DESC 
       LIMIT 100`,
            [userId]
        );

        // Map the trades to determine if the user was the buyer or seller for the UI
        const trades = result.rows.map((t: any) => ({
            ...t,
            // If user is buyer_id, their position increased (buy side)
            side: t.buyer_id === userId ? "buy" : "sell"
        }));

        res.json(trades);
    } catch (error) {
        console.error("Failed to fetch user trades:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
