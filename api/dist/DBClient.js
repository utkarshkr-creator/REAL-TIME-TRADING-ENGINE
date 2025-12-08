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
exports.DBClient = void 0;
const pg_1 = require("pg");
class DBClient {
    constructor() {
        this.client = new pg_1.Client({
            user: "your_user",
            host: "localhost",
            database: "my_database",
            password: "your_password",
            port: 5432,
        });
        this.client.connect();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new DBClient();
        }
        return this.instance;
    }
    getTrades(market_1) {
        return __awaiter(this, arguments, void 0, function* (market, limit = 50) {
            const query = `
            SELECT time, price, volume, currency_code 
            FROM tata_prices 
            ORDER BY time DESC 
            LIMIT $1
        `;
            const result = yield this.client.query(query, [limit]);
            return result.rows;
        });
    }
}
exports.DBClient = DBClient;
