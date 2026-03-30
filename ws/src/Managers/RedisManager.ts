import { RedisClientType, createClient } from "redis"
import { UserManager } from "./UserManager";

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required');
}
const REDIS_URL = process.env.REDIS_URL;

export class SubscriptionManager {
  private static instance: SubscriptionManager;
  private subscriptions: Map<string, string[]> = new Map();
  private reverseSubscriptions: Map<string, string[]> = new Map();
  private redisClient: RedisClientType;
  private constructor() {
    this.redisClient = createClient({ url: REDIS_URL }) as RedisClientType;
    this.redisClient.connect();
  }
  public static getInstance() {
    if (!this.instance) {
      this.instance = new SubscriptionManager();
    }
    return this.instance;
  }

  public subscribe(userId: string, subscription: string) {
    if (this.subscriptions.get(userId)?.includes(subscription)) return;
    this.subscriptions.set(userId, (this.subscriptions.get(userId) || []).concat(subscription));
    this.reverseSubscriptions.set(subscription, (this.reverseSubscriptions.get(subscription) || []).concat(userId));
    if (this.reverseSubscriptions.get(subscription)?.length === 1) {
      console.log("subscription called for market", subscription);
      this.redisClient.subscribe(subscription, this.redisCallbackHandler).catch(e => console.error("Redis sub err:", e));
    }
  }
  private redisCallbackHandler = (message: string, channel: string) => {
    const parsedMessage = JSON.parse(message);
    console.log("message from redis", parsedMessage);
    console.log("on Changel:", channel);
    this.reverseSubscriptions.get(channel)?.forEach(s => UserManager.getInstance().getUser(s)?.emit(parsedMessage));
  }
  public unsubscribe(userId: string, subscription: string) {
    const subscriptions = this.subscriptions.get(userId);
    if (subscriptions) {
      this.subscriptions.set(userId, subscriptions.filter(s => s !== subscription));
    }
    const reverseSubscriptions = this.reverseSubscriptions.get(subscription);
    if (reverseSubscriptions) {
      this.reverseSubscriptions.set(subscription, reverseSubscriptions.filter(x => x !== userId));
      if (this.reverseSubscriptions.get(subscription)?.length === 0) {
        this.reverseSubscriptions.delete(subscription);
        this.redisClient.unsubscribe(subscription).catch(e => console.error("Redis unsub err:", e));
      }
    }
  }
  public userLeft(userId: string) {
    this.subscriptions.get(userId)?.forEach(s => this.unsubscribe(userId, s));
  }
  getSubscriptions(userId: string) {
    return this.subscriptions.get(userId) || [];
  }
}
