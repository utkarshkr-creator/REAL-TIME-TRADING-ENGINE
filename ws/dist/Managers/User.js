"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const RedisManager_1 = require("./RedisManager");
const contants_1 = require("../contants");
class User {
    constructor(id, ws) {
        this.id = id;
        this.ws = ws;
        this.addListeners();
    }
    addListeners() {
        this.ws.on("message", (message) => {
            console.log("without parsed", message);
            const parsedMessage = JSON.parse(message);
            console.log("In user", parsedMessage);
            if (parsedMessage.method === contants_1.SUBSCRIBE) {
                parsedMessage.params.forEach(s => RedisManager_1.SubscriptionManager.getInstance().subscribe(this.id, s));
            }
            if (parsedMessage.method === contants_1.UNSUBSCRIBE) {
                parsedMessage.params.forEach(s => RedisManager_1.SubscriptionManager.getInstance().unsubscribe(this.id, s));
            }
        });
    }
    emit(message) {
        this.ws.send(JSON.stringify(message));
    }
}
exports.User = User;
