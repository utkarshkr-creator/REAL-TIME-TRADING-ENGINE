"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserBalanceNotFoundError = exports.OrderNotFoundError = exports.InvalidMarketError = exports.InsufficientFundsError = exports.CustomError = void 0;
class CustomError extends Error {
    constructor(message, code) {
        super(message);
        this.message = message;
        this.code = code;
        this.name = "CustomError";
    }
}
exports.CustomError = CustomError;
class InsufficientFundsError extends CustomError {
    constructor() {
        super("Insufficient funds", 400);
        this.name = "InsufficientFundsError";
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
class InvalidMarketError extends CustomError {
    constructor() {
        super("Invalid Market", 404);
        this.name = "InvalidMarketError";
    }
}
exports.InvalidMarketError = InvalidMarketError;
class OrderNotFoundError extends CustomError {
    constructor() {
        super("Order not found", 404);
        this.name = "OrderNotFoundError";
    }
}
exports.OrderNotFoundError = OrderNotFoundError;
class UserBalanceNotFoundError extends CustomError {
    constructor() {
        super("User balance not found", 404);
        this.name = "UserBalanceNotFoundError";
    }
}
exports.UserBalanceNotFoundError = UserBalanceNotFoundError;
