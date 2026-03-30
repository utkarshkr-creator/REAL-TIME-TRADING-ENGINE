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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const redis_1 = require("redis");
require("./cronJob");
const http_1 = __importDefault(require("http"));
// Dummy HTTP server for Render health checks
const port = process.env.PORT || 8080;
http_1.default.createServer((req, res) => {
    res.writeHead(200);
    res.end('DB Service is healthy');
}).listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
});
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
}
const pgClient = new pg_1.Client({
    connectionString: process.env.DATABASE_URL,
});
pgClient.connect();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!process.env.REDIS_URL) {
            throw new Error('REDIS_URL environment variable is required');
        }
        const redisClient = (0, redis_1.createClient)({
            url: process.env.REDIS_URL,
        });
        yield redisClient.connect();
        console.log("connected to redis");
        while (true) {
            const response = yield redisClient.rPop("db_processor");
            if (!response) {
            }
            else {
                const data = JSON.parse(response);
                if (data.type === "TRADE_ADDED") {
                    console.log("adding trade data for", data.data.market);
                    const price = parseFloat(data.data.price);
                    const volume = parseFloat(data.data.quantity);
                    const timestamp = new Date(data.data.timestamp);
                    const currencyCode = data.data.market || 'TATA_INR';
                    const buyerId = data.data.buyerId;
                    const sellerId = data.data.sellerId;
                    const query = 'INSERT INTO tata_prices (time, price, volume, currency_code, buyer_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6)';
                    const values = [timestamp, price, volume, currencyCode, buyerId, sellerId];
                    yield pgClient.query(query, values);
                }
                else if (data.type === "ORDER_UPDATE") {
                    console.log("adding/updating order details for", data.data.orderId);
                    // Uses UPSERT to create new orders or update exact executions on existing ones
                    const odata = data.data;
                    if (odata.market && odata.price && odata.quantity && odata.side && odata.userId) {
                        // This must be a creation event (taker order usually has full info initially)
                        const query = `
            INSERT INTO tata_orders (order_id, user_id, market, price, quantity, executed_qty, side, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (order_id) DO UPDATE SET 
              executed_qty = EXCLUDED.executed_qty,
              status = EXCLUDED.status,
              updated_at = CURRENT_TIMESTAMP
          `;
                        let status = odata.status || 'open';
                        if (odata.executedQty >= parseFloat(odata.quantity))
                            status = 'filled';
                        const values = [odata.orderId, odata.userId, odata.market, parseFloat(odata.price), parseFloat(odata.quantity), odata.executedQty, odata.side, status];
                        yield pgClient.query(query, values);
                    }
                    else {
                        // Missing full info, this is likely a partial fill update from the engine on a resting maker order
                        const query = `
            UPDATE tata_orders 
            SET executed_qty = $1, 
                status = CASE WHEN $1 >= quantity THEN 'filled' ELSE status END,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = $2
          `;
                        yield pgClient.query(query, [odata.executedQty, odata.orderId]);
                    }
                }
            }
        }
    });
}
main().catch(console.error);
