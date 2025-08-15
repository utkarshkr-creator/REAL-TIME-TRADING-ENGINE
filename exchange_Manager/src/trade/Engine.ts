import fs from "fs";
import { Order, Orderbook, Fill } from './Orderbook'
import { RedisManager } from '../RedisManager';
import { ORDER_UPDATE, TRADE_ADDED } from '../Types';
import { GET_DEPTH, GET_OPEN_ORDERS,GET_BALANCE, MessageFromApi, ON_RAMP,CANCEL_ORDER ,CREATE_ORDER,GET_PRICE} from '../Types/fromApi';
export const BASE_CURRENCY = "INR";

interface UserBalance {
  [key: string]: {
    available: number,
    locked: number;
  }
}

export class Engine {
  private orderbooks: Orderbook[] = [];
  private balances: Map<string, UserBalance> = new Map();
  private price:Map<string,number>=new Map();
  constructor() {
    let snapshot: any = null;
    try {
      //@ts-ignore
      if (process.env.WITH_SNAPSHOT) {
        snapshot = fs.readFileSync('./snapshot.json');
      }
    } catch (e) {
      console.log("No snapshot found");
    }
    if (snapshot) {
      const snapshotTemp = JSON.parse(snapshot.toString());
      this.orderbooks = snapshotTemp.orderbooks.map((o: Orderbook) => new Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
      this.balances = new Map(snapshotTemp.balances);
      this.price = new Map(snapshotTemp.orderbooks.map((o: { baseAsset: string; currentPrice: number; }) => [o.baseAsset, o.currentPrice]));
    } else {
      this.orderbooks = [new Orderbook('TATA', [], [], 0, 138)];
      this.setBaseBalances();
      this.price = new Map([['TATA', 138]]);
    }
    setInterval(() => {
      this.saveSnapshot();
    }, 1000 * 3);
  }

  saveSnapshot() {
    const snapshotTemp = {
      orderbooks: this.orderbooks.map(o => o.getSnapshot()),
      balances: Array.from(this.balances.entries())
    }
    fs.writeFileSync('./snapshot.json', JSON.stringify(snapshotTemp));
  }

  addOrderbook(orderbook: Orderbook) {
    this.orderbooks.push(orderbook);
  }
  getBalance(userId:string,quoteAsset:string):string{
    const userBalance:UserBalance | undefined = this.balances.get(userId);
    let balance=userBalance?userBalance[quoteAsset].available:0;
    return balance.toString();
  }
  getPrice(asset:string):number{
    const price=this.price.get(asset);
    return price??0;
  }

  createOrder(market: string, price: string, quantity: string, side: "buy" | "sell", userId: string) {
    const orderbook = this.orderbooks.find(x => x.ticker() === market)
    const baseAsset = market.split("_")[0];
    const quoteAsset = market.split("_")[1];
    if (!orderbook) {
      throw new Error("Invalid Market");
    }
    this.checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity);
    const order: Order = {
      price: Number(price),
      quantity: Number(quantity),
      orderId: Math.random().toString(36).substring(2, 15),
      filled: 0,
      side,
      userId
    }

    const { fills, executedQty } = orderbook.addOrder(order);
    this.updateBalance(userId, baseAsset, quoteAsset, side, fills);
    this.createDbTrades(fills, market, userId);
    this.updateDbOrders(order, executedQty, fills, market);
    this.publishWsDepthUpdates(fills, price, side, market);
    this.publishWsPriceUpdates(quoteAsset,price);
    this.publishWsTrades(fills, userId, market);
    return { executedQty, fills, orderId: order.orderId };
  }

  createDbTrades(fills: Fill[], market: string, userId: string) {
    fills.forEach((fill: Fill) => {
      RedisManager.getInstance().pushMessage({
        type: TRADE_ADDED,
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

  publishWsTrades(fills: Fill[], userId: string, market: string) {
    // console.log(market);
    fills.forEach((fill: Fill) => {
      RedisManager.getInstance().publishMessage(`trade@${market}`, {
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

  sendUpdatedDepthAt(price: string, market: string) {
    const orderbook = this.orderbooks.find((o: Orderbook) => o.ticker() === market);
    if (!orderbook) return;

    const depth = orderbook.getDepth();
    const updateBids = depth?.bids.filter(x => x[0] === price);
    const updateAsks = depth?.asks.filter(x => x[0] === price);

    RedisManager.getInstance().publishMessage(`depth@${market}`, {
      stream: `depth@${market}`,
      data: {
        a: updateAsks.length ? updateAsks : [[price, "0"]],
        b: updateBids.length ? updateBids : [[price, "0"]],
        e: "depth"
      }
    });
  }

  publishWsDepthUpdates(fills: Fill[], price: string, side: "buy" | "sell", market: string) {
    const orderbook = this.orderbooks.find((o: Orderbook) => o.ticker() === market);
    if (!orderbook) return;
    const depth = orderbook.getDepth();
    if (side === "buy") {
      const updateAsks = depth?.asks.filter(x => fills.map(f => f.price).includes(x[0].toString()));
      const updateBids = depth?.bids.find(x => x[0] === price);
      // console.log("Depth called",market);
      RedisManager.getInstance().publishMessage(`depth@${market}`, {
        stream: `depth@${market}`,
        data: {
          a: updateAsks,
          b: updateBids ? [updateBids] : [],
          e: "depth"
        }
      });
    } else {
      const updatedBids = depth?.bids.filter(x => fills.map(f => f.price).includes(x[0].toString()));
      const updateAsk = depth?.asks.find(x => x[0] === price);
      RedisManager.getInstance().publishMessage(`depth@${market}`, {
        stream: `depth@${market}`,
        data: {
          a: updateAsk ? [updateAsk] : [],
          b: updatedBids,
          e: "depth"
        }
      });
    }

  }
  publishWsPriceUpdates(quoteAsset:string, price: string) {
    RedisManager.getInstance().publishMessage(`price@${quoteAsset}`, {
      stream: `price@${quoteAsset}`,
      data: {
        p:price
      }
    });
  }

  process({ message, clientId }: { message: MessageFromApi, clientId: string }) {
    switch (message.type) {
      case GET_BALANCE:
        try {
          const balance=this.getBalance(message.data.userId,message.data.quoteAsset);
          RedisManager.getInstance().sendToApi(clientId,{
            type: "GET_BALANCE",
            payload:{
              userBalance:balance,
            }
          });
        } catch (error) {
          console.log("Error In getting user Balance",error);
        }
        break;
      case GET_PRICE:
        try {
          const price=this.getPrice(message.data.quoteAsset);
          RedisManager.getInstance().sendToApi(clientId,{
            type: "GET_PRICE",
            payload:{
              price:price.toString(),
            }
          });
        } catch (error) {
          console.log("Error In getting quoteAsset price",error);
        }
        break;
      case CREATE_ORDER:
        try {
          const { executedQty, fills, orderId } = this.createOrder(message.data.market, message.data.price, message.data.quantity, message.data.side, message.data.userId);
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_PLACED",
            payload: {
              orderId,
              executedQty,
              fills
            }
          });
        } catch (e) {
          console.log("error in order placing", e);
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId: "",
              executedQty: 0,
              remainingQty: 0
            }
          })
        }
        break;
      case CANCEL_ORDER:
        try {
          const orderId = message.data.orderId;
          const cancelMarket = message.data.market;
          const cancelOrderbook = this.orderbooks.find((o: Orderbook) => o.ticker() === cancelMarket);
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
            this.balances.get(order.userId)[BASE_CURRENCY].available += leftQuantity;
            //@ts-ignore
            this.balances.get(order.userId)[BASE_CURRENCY].locked -= leftQuantity;
            if (price) {
              this.sendUpdatedDepthAt(price.toString(), cancelMarket);
            }
          } else {
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
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId,
              executedQty: 0,
              remainingQty: 0,
            }
          })
        } catch (e) {
          console.log("Error while cancelling order", e);
        }
        break;
      case GET_OPEN_ORDERS:
        try {
          const openOrderbook = this.orderbooks.find(o => o.ticker() === message.data.market);
          if (!openOrderbook) {
            throw new Error("No orderbook found");
          }
          const openOrders = openOrderbook?.getOpenOrders(message.data.userId);

          RedisManager.getInstance().sendToApi(clientId, {
            type: "OPEN_ORDERS",
            payload: openOrders
          });

        } catch (e) {
          console.log("error in Get open Orders ", e);
        }
        break;
      case ON_RAMP:
        const userId = message.data.userId;
        const amount = Number(message.data.amount);
        this.onRamp(userId, amount);
        break;
      case GET_DEPTH:
        try {
          const market = message.data.market;
          const orderbook = this.orderbooks.find(o => o.ticker() === market);
          if (!orderbook) {
            throw new Error("No orderbook found");
          }
          RedisManager.getInstance().sendToApi(clientId, {
            type: "DEPTH",
            payload: orderbook?.getDepth()
          });
        } catch (e) {
          console.log("error in getting Depth", e);
          RedisManager.getInstance().sendToApi(clientId, {
            type: "DEPTH",
            payload: {
              bids: [],
              asks: []
            }
          })
        }
        break;
    }
  }

  onRamp(userId: string, amount: number) {
    const userBalance = this.balances.get(userId);
    if (!userBalance) {
      this.balances.set(userId, {
        [BASE_CURRENCY]: {
          available: amount,
          locked: 0
        }
      });
    } else {
      userBalance[BASE_CURRENCY].available += amount;
    }
  }

  checkAndLockFunds(baseAsset: string, quoteAsset: string, side: "buy" | "sell", userId: string, price: string, quantity: string) {
    const totalPrice = Number(quantity) * Number(price);
    if (side === "buy") {
      if ((this.balances.get(userId)?.[quoteAsset]?.available || 0) < totalPrice) {
        throw new Error("Insufficient funds");
      }
      //@ts-ignore 
      this.balances.get(userId)[quoteAsset].available -= totalPrice;
      //@ts-ignore 
      this.balances.get(userId)[quoteAsset].locked += totalPrice;
    } else {
      if ((this.balances.get(userId)?.[baseAsset]?.available || 0) < Number(quantity)) {
        throw new Error("Insufficient funds");
      }
      //@ts-ignore 
      this.balances.get(userId)[baseAsset].available -= Number(quantity);
      //@ts-ignore 
      this.balances.get(userId)[baseAsset].locked += Number(quantity);
    }
  }

  updateBalance(userId: string, baseAsset: string, quoteAsset: string, side: "buy" | "sell", fills: Fill[]) {
    if (side === "buy") {
      fills.forEach((fill: Fill) => {
        const totalValue = fill.qty * Number(fill.price);
        //@ts-ignore
        this.balances.get(fill.otherUserId)[quoteAsset].available += totalValue;
        //@ts-ignore
        this.balances.get(userId)[quoteAsset].locked -= totalValue;
        //@ts-ignore
        this.balances.get(fill.otherUserId)[baseAsset].locked -= fill.qty;
        //@ts-ignore
        this.balances.get(userId)[baseAsset].available += fill.qty;
      })
    } else {
      fills.forEach((fill: Fill) => {
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


  updateDbOrders(order: Order, executedQty: number, fills: Fill[], market: string) {
    RedisManager.getInstance().pushMessage({
      type: ORDER_UPDATE,
      data: {
        orderId: order.orderId,
        executedQty,
        market,
        price: order.price.toString(),
        quantity: order.quantity.toString(),
        side: order.side
      }
    });
    fills.forEach((fill: Fill) => {
      RedisManager.getInstance().pushMessage({
        type: ORDER_UPDATE,
        data: {
          orderId: fill.marketOrderId,
          executedQty: fill.qty
        }
      })
    })
  }

  setBaseBalances() {
    this.balances.set("1", {
      [BASE_CURRENCY]: {
        available: 1000000000000000,
        locked: 0
      },
      "TATA": {
        available: 100000000,
        locked: 0
      }
    });
    this.balances.set("2", {
      [BASE_CURRENCY]: {
        available: 100000000,
        locked: 0
      },
      "TATA": {
        available: 100000000,
        locked: 0
      }
    });
    this.balances.set("3", {
      [BASE_CURRENCY]: {
        available: 100000000,
        locked: 0
      },
      "TATA": {
        available: 100000000,
        locked: 0
      }
    });
    this.balances.set("6", {
      [BASE_CURRENCY]: {
        available: 100000000,
        locked: 0
      },
      "TATA": {
        available: 100000000,
        locked: 0
      }
    });

    this.balances.set("7", {
      [BASE_CURRENCY]: {
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
