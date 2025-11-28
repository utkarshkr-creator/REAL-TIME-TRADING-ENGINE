
export class CustomError extends Error {
    constructor(public message: string, public code: number) {
        super(message);
        this.name = "CustomError";
    }
}

export class InsufficientFundsError extends CustomError {
    constructor() {
        super("Insufficient funds", 400);
        this.name = "InsufficientFundsError";
    }
}

export class InvalidMarketError extends CustomError {
    constructor() {
        super("Invalid Market", 404);
        this.name = "InvalidMarketError";
    }
}

export class OrderNotFoundError extends CustomError {
    constructor() {
        super("Order not found", 404);
        this.name = "OrderNotFoundError";
    }
}

export class UserBalanceNotFoundError extends CustomError {
    constructor() {
        super("User balance not found", 404);
        this.name = "UserBalanceNotFoundError";
    }
}
