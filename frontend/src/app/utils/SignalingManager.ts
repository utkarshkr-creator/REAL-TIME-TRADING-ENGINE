import { Ticker } from "./types";

export const BASE_URL = process.env.NEXT_PUBLIC_WS_URL;
if (!BASE_URL) {
  throw new Error("NEXT_PUBLIC_WS_URL is not defined");
}

export class SignalingManager {
  private ws: WebSocket;
  private static instance: SignalingManager;
  private bufferedMessages: any[] = [];
  private callbacks: { [key: string]: { callback: (data: any) => void, id: string }[] } = {};
  private id: number = 1;
  private initialized: boolean = false;

  private constructor() {
    this.ws = new WebSocket(BASE_URL!);
    this.init();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new SignalingManager();
    }
    return this.instance;
  }

  init() {
    this.ws.onopen = () => {
      this.initialized = true;
      this.bufferedMessages.forEach(message => {
        this.ws.send(JSON.stringify(message));
      });
      this.bufferedMessages = [];
    }
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const type = message.data.e;
      // console.log("message", message);
      if (this.callbacks[message.stream]) {
        this.callbacks[message.stream].forEach(({ callback }) => {
          if (type === "ticker") {
            const newTicker: Partial<Ticker> = {
              lastPrice: message.data.c,
              high: message.data.h,
              low: message.data.l,
              volume: message.data.v,
              quoteVolume: message.data.V,
              symbol: message.data.s,
              priceChange: message.data.P,
              priceChangePercent: message.data.p,
              firstPrice: message.data.o,
              trades: message.data.n,
            }
            callback(newTicker);
          }
          if (type === "depth") {
            const updatedBids = message.data.b;
            const updatedAsks = message.data.a;
            callback({ bids: updatedBids, asks: updatedAsks });
          }
          if (type === "trade") {
            const newTrade = {
              id: Math.random(), // Generate temporary ID
              price: message.data.p,
              quantity: message.data.q,
              timestamp: message.data.t,
              isBuyerMaker: message.data.m,
            }
            callback(newTrade);
          }
        });
      }
    }
  }

  sendMessage(message: any) {
    const messageToSend = {
      ...message,
      id: this.id++
    }
    if (!this.initialized) {
      this.bufferedMessages.push(messageToSend);
      return;
    }
    this.ws.send(JSON.stringify(messageToSend));
  }

  async registerCallback(channel: string, callback: any, id: string) {
    this.callbacks[channel] = this.callbacks[channel] || [];
    this.callbacks[channel].push({ callback, id });

    if (this.callbacks[channel].length === 1) {
      // First listener, send subscribe
      this.sendMessage({
        method: "SUBSCRIBE",
        params: [channel]
      });
    }
  }

  async deRegisterCallback(channel: string, id: string) {
    if (this.callbacks[channel]) {
      const index = this.callbacks[channel].findIndex((callback) => callback.id === id);
      if (index !== -1) {
        this.callbacks[channel].splice(index, 1);
      }

      if (this.callbacks[channel].length === 0) {
        // Last listener removed, send unsubscribe
        this.sendMessage({
          method: "UNSUBSCRIBE",
          params: [channel]
        });
        delete this.callbacks[channel];
      }
    }
  }
}