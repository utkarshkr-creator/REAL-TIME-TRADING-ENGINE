"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const UserManager_1 = require("./Managers/UserManager");
const wss = new ws_1.WebSocketServer({ port: 8080 });
wss.on('connection', function connection(ws) {
    UserManager_1.UserManager.getInstance().addUser(ws);
});
