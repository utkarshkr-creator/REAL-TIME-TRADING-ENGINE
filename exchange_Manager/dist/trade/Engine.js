"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Engine = exports.BASE_CURRENCY = void 0;
const fs_1 = __importDefault(require("fs"));
const Orderbook_1 = require("./Orderbook");
const RedisManager_1 = require("../RedisManager");
const Types_1 = require("../Types");
const fromApi_1 = require("../Types/fromApi");
exports.BASE_CURRENCY = "INR";
class Engine {
    constructor() {
        this.orderbooks = [];
        this.balances = new Map();
        let snapshot = null;
        try {
            //@ts-ignore
            if (process.env.WITH_SNAPSHOT) {
                snapshot = fs_1.default.readFileSync('./snapshot.json');
            }
        }
        catch (e) {
            console.log("No snapshot found");
        }
        if (snapshot) {
            const snapshotTemp = JSON.parse(snapshot.toString());
            this.orderbooks = snapshotTemp.orderbooks.map((o) => new Orderbook_1.Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
            this.balances = new Map(snapshotTemp.balances);
        }
        else {
            this.orderbooks = [new Orderbook_1.Orderbook('TATA', [], [], 0, 0)];
            this.setBaseBalances();
        }
        setInterval(() => {
            this.saveSnapshot();
        }, 1000 * 3);
    }
    saveSnapshot() {
        const snapshotTemp = {
            orderbooks: this.orderbooks.map(o => o.getSnapshot()),
            balances: Array.from(this.balances.entries())
        };
        fs_1.default.writeFileSync('./snapshot.json', JSON.stringify(snapshotTemp));
    }
    addOrderbook(orderbook) {
        this.orderbooks.push(orderbook);
    }
    getBalance(userId, quoteAsset) {
        const userBalance = this.balances.get(userId);
        let balance = userBalance ? userBalance[quoteAsset].available : 0;
        return balance.toString();
    }
    createOrder(market, price, quantity, side, userId) {
        const orderbook = this.orderbooks.find(x => x.ticker() === market);
        const baseAsset = market.split("_")[0];
        const quoteAsset = market.split("_")[1];
        if (!orderbook) {
            throw new Error("Invalid Market");
        }
        this.checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity);
        const order = {
            price: Number(price),
            quantity: Number(quantity),
            orderId: Math.random().toString(36).substring(2, 15),
            filled: 0,
            side,
            userId
        };
        const { fills, executedQty } = orderbook.addOrder(order);
        this.updateBalance(userId, baseAsset, quoteAsset, side, fills);
        this.createDbTrades(fills, market, userId);
        this.updateDbOrders(order, executedQty, fills, market);
        this.publishWsDepthUpdates(fills, price, side, market);
        this.publishWsTrades(fills, userId, market);
        return { executedQty, fills, orderId: order.orderId };
    }
    createDbTrades(fills, market, userId) {
        fills.forEach((fill) => {
            RedisManager_1.RedisManager.getInstance().pushMessage({
                type: Types_1.TRADE_ADDED,
                data: {
                    market,
                    id: fill.tradeId.toString(),
                    isBuyerMaker: fill.otherUserId === userId,
                    price: fill.price,
                    quantity: fill.qty.toString(),
                    quoteQuantity: (fill.qty * Number(fill.price)).toString(),
                    timestamp: Date.now()
                }
            });
        });
    }
    publishWsTrades(fills, userId, market) {
        // console.log(market);
        fills.forEach((fill) => {
            RedisManager_1.RedisManager.getInstance().publishMessage(`trade@${market}`, {
                stream: `trade@${market}`,
                data: {
                    e: "trade",
                    t: fill.tradeId,
                    m: fill.otherUserId === userId,
                    p: fill.price,
                    q: fill.qty.toString(),
                    s: market
                }
            });
        });
    }
    sendUpdatedDepthAt(price, market) {
        const orderbook = this.orderbooks.find((o) => o.ticker() === market);
        if (!orderbook)
            return;
        const depth = orderbook.getDepth();
        const updateBids = depth === null || depth === void 0 ? void 0 : depth.bids.filter(x => x[0] === price);
        const updateAsks = depth === null || depth === void 0 ? void 0 : depth.asks.filter(x => x[0] === price);
        RedisManager_1.RedisManager.getInstance().publishMessage(`depth@${market}`, {
            stream: `depth@${market}`,
            data: {
                a: updateAsks.length ? updateAsks : [[price, "0"]],
                b: updateBids.length ? updateBids : [[price, "0"]],
                e: "depth"
            }
        });
    }
    publishWsDepthUpdates(fills, price, side, market) {
        const orderbook = this.orderbooks.find((o) => o.ticker() === market);
        if (!orderbook)
            return;
        const depth = orderbook.getDepth();
        if (side === "buy") {
            const updateAsks = depth === null || depth === void 0 ? void 0 : depth.asks.filter(x => fills.map(f => f.price).includes(x[0].toString()));
            const updateBids = depth === null || depth === void 0 ? void 0 : depth.bids.find(x => x[0] === price);
            // console.log("Depth called",market);
            RedisManager_1.RedisManager.getInstance().publishMessage(`depth@${market}`, {
                stream: `depth@${market}`,
                data: {
                    a: updateAsks,
                    b: updateBids ? [updateBids] : [],
                    e: "depth"
                }
            });
        }
        else {
            const updatedBids = depth === null || depth === void 0 ? void 0 : depth.bids.filter(x => fills.map(f => f.price).includes(x[0].toString()));
            const updateAsk = depth === null || depth === void 0 ? void 0 : depth.asks.find(x => x[0] === price);
            RedisManager_1.RedisManager.getInstance().publishMessage(`depth@${market}`, {
                stream: `depth@${market}`,
                data: {
                    a: updateAsk ? [updateAsk] : [],
                    b: updatedBids,
                    e: "depth"
                }
            });
        }
    }
    process({ message, clientId }) {
        switch (message.type) {
            case fromApi_1.GET_BALANCE:
                try {
                    const balance = this.getBalance(message.data.userId, message.data.quoteAsset);
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "GET_BALANCE",
                        payload: {
                            userBalance: balance,
                        }
                    });
                }
                catch (error) {
                    console.log("Error In getting user Balance", error);
                }
                break;
            case fromApi_1.CREATE_ORDER:
                try {
                    const { executedQty, fills, orderId } = this.createOrder(message.data.market, message.data.price, message.data.quantity, message.data.side, message.data.userId);
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_PLACED",
                        payload: {
                            orderId,
                            executedQty,
                            fills
                        }
                    });
                }
                catch (e) {
                    console.log("error in order placing", e);
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId: "",
                            executedQty: 0,
                            remainingQty: 0
                        }
                    });
                }
                break;
            case fromApi_1.CANCEL_ORDER:
                try {
                    const orderId = message.data.orderId;
                    const cancelMarket = message.data.market;
                    const cancelOrderbook = this.orderbooks.find((o) => o.ticker() === cancelMarket);
                    const quoteAsset = cancelMarket.split("_")[1];
                    if (!cancelOrderbook) {
                        throw new Error("No orderbook found");
                    }
                    const order = cancelOrderbook.asks.find(o => o.orderId === orderId) || cancelOrderbook.bids.find(o => o.orderId === orderId);
                    if (!order) {
                        console.log("No order found");
                        throw new Error("No order found");
                    }
                    if (order.side === "buy") {
                        const price = cancelOrderbook.cancelBid(order);
                        const leftQuantity = (order.quantity - order.filled) * order.price;
                        //@ts-ignore
                        this.balances.get(order.userId)[exports.BASE_CURRENCY].available += leftQuantity;
                        //@ts-ignore
                        this.balances.get(order.userId)[exports.BASE_CURRENCY].locked -= leftQuantity;
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    }
                    else {
                        const price = cancelOrderbook.cancelAsk(order);
                        const leftQuantity = order.quantity - order.filled;
                        //@ts-ignore
                        this.balances.get(order.userId)[quoteAsset].available += leftQuantity;
                        //@ts-ignore
                        this.balances.get(order.userId)[quoteAsset].locked -= leftQuantity;
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    }
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId,
                            executedQty: 0,
                            remainingQty: 0,
                        }
                    });
                }
                catch (e) {
                    console.log("Error while cancelling order", e);
                }
                break;
            case fromApi_1.GET_OPEN_ORDERS:
                try {
                    const openOrderbook = this.orderbooks.find(o => o.ticker() === message.data.market);
                    if (!openOrderbook) {
                        throw new Error("No orderbook found");
                    }
                    const openOrders = openOrderbook === null || openOrderbook === void 0 ? void 0 : openOrderbook.getOpenOrders(message.data.userId);
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "OPEN_ORDERS",
                        payload: openOrders
                    });
                }
                catch (e) {
                    console.log("error in Get open Orders ", e);
                }
                break;
            case fromApi_1.ON_RAMP:
                const userId = message.data.userId;
                const amount = Number(message.data.amount);
                this.onRamp(userId, amount);
                break;
            case fromApi_1.GET_DEPTH:
                try {
                    const market = message.data.market;
                    const orderbook = this.orderbooks.find(o => o.ticker() === market);
                    if (!orderbook) {
                        throw new Error("No orderbook found");
                    }
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "DEPTH",
                        payload: orderbook === null || orderbook === void 0 ? void 0 : orderbook.getDepth()
                    });
                }
                catch (e) {
                    console.log("error in getting Depth", e);
                    RedisManager_1.RedisManager.getInstance().sendToApi(clientId, {
                        type: "DEPTH",
                        payload: {
                            bids: [],
                            asks: []
                        }
                    });
                }
                break;
        }
    }
    onRamp(userId, amount) {
        const userBalance = this.balances.get(userId);
        if (!userBalance) {
            this.balances.set(userId, {
                [exports.BASE_CURRENCY]: {
                    available: amount,
                    locked: 0
                }
            });
        }
        else {
            userBalance[exports.BASE_CURRENCY].available += amount;
        }
    }
    checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity) {
        var _a, _b, _c, _d;
        const totalPrice = Number(quantity) * Number(price);
        if (side === "buy") {
            if ((((_b = (_a = this.balances.get(userId)) === null || _a === void 0 ? void 0 : _a[quoteAsset]) === null || _b === void 0 ? void 0 : _b.available) || 0) < totalPrice) {
                throw new Error("Insufficient funds");
            }
            //@ts-ignore 
            this.balances.get(userId)[quoteAsset].available -= totalPrice;
            //@ts-ignore 
            this.balances.get(userId)[quoteAsset].locked += totalPrice;
        }
        else {
            if ((((_d = (_c = this.balances.get(userId)) === null || _c === void 0 ? void 0 : _c[baseAsset]) === null || _d === void 0 ? void 0 : _d.available) || 0) < Number(quantity)) {
                throw new Error("Insufficient funds");
            }
            //@ts-ignore 
            this.balances.get(userId)[baseAsset].available -= Number(quantity);
            //@ts-ignore 
            this.balances.get(userId)[baseAsset].locked += Number(quantity);
        }
    }
    updateBalance(userId, baseAsset, quoteAsset, side, fills) {
        if (side === "buy") {
            fills.forEach((fill) => {
                const totalValue = fill.qty * Number(fill.price);
                //@ts-ignore
                this.balances.get(fill.otherUserId)[quoteAsset].available += totalValue;
                //@ts-ignore
                this.balances.get(userId)[quoteAsset].locked -= totalValue;
                //@ts-ignore
                this.balances.get(fill.otherUserId)[baseAsset].locked -= fill.qty;
                //@ts-ignore
                this.balances.get(userId)[baseAsset].available += fill.qty;
            });
        }
        else {
            fills.forEach((fill) => {
                const totalValue = (fill.qty * Number(fill.price));
                //@ts-ignore
                this.balances.get(fill.otherUserId)[quoteAsset].locked -= totalValue;
                // @ts-ignore
                this.balances.get(userId)[quoteAsset].available += totalValue;
                //@ts-ignore
                this.balances.get(fill.otherUserId)[baseAsset].available += fill.qty;
                //@ts-ignore
                this.balances.get(userId)[baseAsset].locked -= fill.qty;
            });
        }
    }
    updateDbOrders(order, executedQty, fills, market) {
        RedisManager_1.RedisManager.getInstance().pushMessage({
            type: Types_1.ORDER_UPDATE,
            data: {
                orderId: order.orderId,
                executedQty,
                market,
                price: order.price.toString(),
                quantity: order.quantity.toString(),
                side: order.side
            }
        });
        fills.forEach((fill) => {
            RedisManager_1.RedisManager.getInstance().pushMessage({
                type: Types_1.ORDER_UPDATE,
                data: {
                    orderId: fill.marketOrderId,
                    executedQty: fill.qty
                }
            });
        });
    }
    setBaseBalances() {
        this.balances.set("1", {
            [exports.BASE_CURRENCY]: {
                available: 1000000000000000,
                locked: 0
            },
            "TATA": {
                available: 100000000,
                locked: 0
            }
        });
        this.balances.set("2", {
            [exports.BASE_CURRENCY]: {
                available: 100000000,
                locked: 0
            },
            "TATA": {
                available: 100000000,
                locked: 0
            }
        });
        this.balances.set("3", {
            [exports.BASE_CURRENCY]: {
                available: 100000000,
                locked: 0
            },
            "TATA": {
                available: 100000000,
                locked: 0
            }
        });
        this.balances.set("6", {
            [exports.BASE_CURRENCY]: {
                available: 100000000,
                locked: 0
            },
            "TATA": {
                available: 100000000,
                locked: 0
            }
        });
        this.balances.set("7", {
            [exports.BASE_CURRENCY]: {
                available: 100000000,
                locked: 0
            },
            "TATA": {
                available: 100000000,
                locked: 0
            }
        });
    }
}
exports.Engine = Engine;
