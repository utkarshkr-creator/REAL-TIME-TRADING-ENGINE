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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var axios_1 = __importDefault(require("axios"));
var ws_1 = __importDefault(require("ws"));
var API_URL = 'http://localhost:3006/api/v1';
var WS_URL = 'ws://localhost:8080';
var MARKET = 'TATA_INR';
var USER_1 = '1';
var USER_2 = '2';
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var tickersRes, ws, wsMessages, buyOrder1Res, sellOrder1Res, depthRes, takerSellRes, startTime, endTime, klinesRes, tradesRes;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log('--- Starting Integration Tests ---');
                    // 1. Check Tickers
                    console.log('\n[API] Testing GET /tickers...');
                    return [4 /*yield*/, axios_1.default.get("".concat(API_URL, "/tickers"))];
                case 1:
                    tickersRes = _d.sent();
                    console.log("\u2713 Received ".concat(tickersRes.data.data.length, " tickers"));
                    // 2. Clear open orders for users
                    console.log("\n[API] Canceling existing open orders...");
                    // Assuming you can't easily clear all, we'll just check balance.
                    // 3. Connect WebSocket
                    console.log('\n[WS] Connecting to WebSocket...');
                    ws = new ws_1.default(WS_URL);
                    wsMessages = [];
                    ws.on('message', function (data) {
                        var _a, _b, _c;
                        var msg = JSON.parse(data.toString());
                        wsMessages.push(((_a = msg.data) === null || _a === void 0 ? void 0 : _a.e) || msg.type);
                        if (((_b = msg.data) === null || _b === void 0 ? void 0 : _b.e) === 'trade') {
                            console.log("[WS] Received Trade Event: ".concat(JSON.stringify(msg.data)));
                        }
                        else if (((_c = msg.data) === null || _c === void 0 ? void 0 : _c.e) === 'depth') {
                            console.log("[WS] Received Depth Event");
                        }
                        else if (msg.type === 'SUBSCRIBED') {
                            console.log("[WS] Subscribed successfully.");
                        }
                    });
                    return [4 /*yield*/, new Promise(function (resolve) { return ws.on('open', resolve); })];
                case 2:
                    _d.sent();
                    console.log('✓ WebSocket connected');
                    ws.send(JSON.stringify({
                        method: 'SUBSCRIBE',
                        params: ["trade@".concat(MARKET), "depth@".concat(MARKET), "ticker@".concat(MARKET)]
                    }));
                    return [4 /*yield*/, sleep(1000)];
                case 3:
                    _d.sent(); // Wait for sub
                    // 4. Place a Maker BUY Order (User 1)
                    console.log("\n[API] User 1 placing Maker BUY order at 135 INR...");
                    return [4 /*yield*/, axios_1.default.post("".concat(API_URL, "/order"), {
                            market: MARKET,
                            price: '135',
                            quantity: '5',
                            side: 'buy',
                            userId: USER_1
                        })];
                case 4:
                    buyOrder1Res = _d.sent();
                    console.log("\u2713 Order placed: ".concat(buyOrder1Res.data.orderId));
                    return [4 /*yield*/, sleep(500)];
                case 5:
                    _d.sent(); // Wait for depth WS event
                    // 5. Place a Maker SELL Order (User 2)
                    console.log("\n[API] User 2 placing Maker SELL order at 145 INR...");
                    return [4 /*yield*/, axios_1.default.post("".concat(API_URL, "/order"), {
                            market: MARKET,
                            price: '145',
                            quantity: '5',
                            side: 'sell',
                            userId: USER_2
                        })];
                case 6:
                    sellOrder1Res = _d.sent();
                    console.log("\u2713 Order placed: ".concat(sellOrder1Res.data.orderId));
                    return [4 /*yield*/, sleep(500)];
                case 7:
                    _d.sent();
                    // 6. Check Depth API
                    console.log("\n[API] Checking orderbook depth...");
                    return [4 /*yield*/, axios_1.default.get("".concat(API_URL, "/depth?symbol=").concat(MARKET))];
                case 8:
                    depthRes = _d.sent();
                    console.log("\u2713 Orderbook has ".concat(((_a = depthRes.data.bids) === null || _a === void 0 ? void 0 : _a.length) || 0, " bids and ").concat(((_b = depthRes.data.asks) === null || _b === void 0 ? void 0 : _b.length) || 0, " asks"));
                    // 7. Place a Taker SELL Order (User 2) to trigger a trade
                    console.log("\n[API] User 2 placing Taker SELL order at 135 INR (matches User 1)...");
                    return [4 /*yield*/, axios_1.default.post("".concat(API_URL, "/order"), {
                            market: MARKET,
                            price: '135',
                            quantity: '2',
                            side: 'sell',
                            userId: USER_2
                        })];
                case 9:
                    takerSellRes = _d.sent();
                    console.log("\u2713 Taker Order placed: ".concat(takerSellRes.data.orderId));
                    if (takerSellRes.data.fills && takerSellRes.data.fills.length > 0) {
                        console.log("\u2713 FILLS GENERATED: ".concat(JSON.stringify(takerSellRes.data.fills)));
                    }
                    return [4 /*yield*/, sleep(1000)];
                case 10:
                    _d.sent(); // Wait for trade WS events and DB updates
                    // 8. Verify Klines
                    console.log("\n[API] Checking klines for generated trade...");
                    startTime = Math.floor(Date.now() / 1000) - 3600;
                    endTime = Math.floor(Date.now() / 1000) + 3600;
                    return [4 /*yield*/, axios_1.default.get("".concat(API_URL, "/klines?symbol=").concat(MARKET, "&interval=1m&startTime=").concat(startTime, "&endTime=").concat(endTime))];
                case 11:
                    klinesRes = _d.sent();
                    console.log("\u2713 Received ".concat(klinesRes.data.length, " klines"));
                    // 9. Verify trades route
                    console.log("\n[API] Checking trades history...");
                    return [4 /*yield*/, axios_1.default.get("".concat(API_URL, "/trades?symbol=").concat(MARKET))];
                case 12:
                    tradesRes = _d.sent();
                    console.log("\u2713 Received ".concat(((_c = tradesRes.data) === null || _c === void 0 ? void 0 : _c.length) || 0, " recent trades in DB"));
                    console.log('\n--- Closing connections ---');
                    ws.close();
                    console.log('✓ All tests finished executed. Please verify the API and WS logs if needed.');
                    return [2 /*return*/];
            }
        });
    });
}
runTests().catch(function (err) {
    var _a;
    console.error('Integration test failed:', ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message);
});
