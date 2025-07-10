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
exports.klineRouter = void 0;
const pg_1 = require("pg");
const express_1 = require("express");
const pgClient = new pg_1.Client({
    user: 'your_user',
    host: 'localhost',
    database: 'my_database',
    password: 'your_password',
    port: 5432,
});
pgClient.connect();
exports.klineRouter = (0, express_1.Router)();
exports.klineRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { market, interval, startTime, endTime } = req.query;
    let query;
    switch (interval) {
        case '1m':
            query = `SELECT * FROM klines_1m WHERE bucket >= $1 AND bucket <= $2`;
            break;
        case '1h':
            query = `SELECT * FROM klines_1m WHERE  bucket >= $1 AND bucket <= $2`;
            break;
        case '1w':
            query = `SELECT * FROM klines_1w WHERE bucket >= $1 AND bucket <= $2`;
            break;
        default:
            return res.status(400).send('Invalid interval');
    }
    try {
        //@ts-ignore
        const result = yield pgClient.query(query, [new Date(startTime * 1000), new Date(endTime * 1000)]);
        console.log("result in api", result.rows);
        res.json(result.rows.map(x => ({
            close: x.close,
            end: x.bucket,
            high: x.high,
            low: x.low,
            open: x.open,
            quoteVolume: x === null || x === void 0 ? void 0 : x.quoteVolume,
            start: x === null || x === void 0 ? void 0 : x.start,
            trades: x === null || x === void 0 ? void 0 : x.trades,
            volume: x === null || x === void 0 ? void 0 : x.volume,
        })));
    }
    catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
}));
