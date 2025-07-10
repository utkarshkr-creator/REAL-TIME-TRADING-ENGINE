"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionManager = void 0;
const redis_1 = require("redis");
const UserManager_1 = require("./UserManager");
class SubscriptionManager {
    constructor() {
        this.subscriptions = new Map();
        this.reverseSubscriptions = new Map();
        this.redisCallbackHandler = (message, channel) => {
            var _a;
            const parsedMessage = JSON.parse(message);
            console.log("message from redis", parsedMessage);
            console.log("on Changel:", channel);
            (_a = this.reverseSubscriptions.get(channel)) === null || _a === void 0 ? void 0 : _a.forEach(s => { var _a; return (_a = UserManager_1.UserManager.getInstance().getUser(s)) === null || _a === void 0 ? void 0 : _a.emit(parsedMessage); });
        };
        this.redisClient = (0, redis_1.createClient)();
        this.redisClient.connect();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new SubscriptionManager();
        }
        return this.instance;
    }
    subscribe(userId, subscription) {
        var _a, _b;
        if ((_a = this.subscriptions.get(userId)) === null || _a === void 0 ? void 0 : _a.includes(subscription))
            return;
        //subscribe to market, with already subscribed market
        this.subscriptions.set(userId, (this.subscriptions.get(userId) || []).concat(subscription));
        //Add usedId with Market 
        this.reverseSubscriptions.set(subscription, (this.reverseSubscriptions.get(subscription) || []).concat(userId));
        if (((_b = this.reverseSubscriptions.get(subscription)) === null || _b === void 0 ? void 0 : _b.length) === 1) {
            console.log("subscirption called for market", subscription);
            this.redisClient.subscribe(subscription, this.redisCallbackHandler);
        }
    }
    unsubscribe(userId, subscription) {
        var _a;
        // console.log("unsubcribeing user", userId);
        const subscriptions = this.subscriptions.get(userId);
        if (subscriptions) {
            this.subscriptions.set(userId, subscriptions.filter(s => s !== subscription));
        }
        const reverseSubscriptions = this.reverseSubscriptions.get(subscription);
        if (reverseSubscriptions) {
            this.reverseSubscriptions.set(subscription, reverseSubscriptions.filter(x => x !== userId));
            if (((_a = this.reverseSubscriptions.get(subscription)) === null || _a === void 0 ? void 0 : _a.length) === 0) {
                this.reverseSubscriptions.delete(subscription);
                this.redisClient.unsubscribe(subscription);
            }
        }
    }
    userLeft(userId) {
        var _a;
        (_a = this.subscriptions.get(userId)) === null || _a === void 0 ? void 0 : _a.forEach(s => this.unsubscribe(userId, s));
    }
    getSubscriptions(userId) {
        return this.subscriptions.get(userId) || [];
    }
}
exports.SubscriptionManager = SubscriptionManager;
