export const CREATE_ORDER = "CREATE_ORDER";
export const CANCEL_ORDER = "CANCEL_ORDER";
export const GET_OPEN_ORDERS = "GET_OPEN_ORDERS";
export const ON_RAMP = "ON_RAMP";
export const GET_DEPTH = "GET_DEPTH";
export const GET_BALANCE="GET_BALANCE";
export const GET_PRICE="GET_PRICE";
export interface Ticker {
  "firstPrice": string,
  "high": string,
  "lastPrice": string,
  "low": string,
  "priceChange": string,
  "priceChangePercent": string,
  "quoteVolume": string,
  "symbol": string,
  "trades": string,
  "volume": string
}
export interface Trade {
  "id": number,
  "isBuyerMaker": boolean,
  "price": string,
  "quantity": string,
  "quoteQuantity": string,
  "timestamp": number
}
export type MessageFromOrderbook = {
  type: "DEPTH",
  payload: {
    market: string,
    bids: [string, string][],
    asks: [string, string][],
  }
} | {
  type: "ORDER_PLACED",
  payload: {
    orderId: string,
    executedQty: number,
    fills: [
      {
        price: string,
        qty: number,
        tradeId: number
      }
    ]
  }
} | {
  type: "ORDER_CANCELLED",
  payload: {
    orderId: string,
    executedQty: number,
    remainingQty: number
  }
} | {
  type: "OPEN_ORDERS",
  payload: {
    orderId: string,
    executedQty: number,
    price: string,
    quantity: string,
    side: "buy" | "sell",
    userId: string
  }
} | {
  type:"GET_BALANCE",
  payload:{
    userBalance:string
  }
} | {
  type:"GET_PRICE",
  payload:{
    price:string
  }
}

