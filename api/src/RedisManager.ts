import { createClient, RedisClientType } from "redis"
import { MessageToEngine } from "./utils/types/to";
import { MessageFromOrderbook } from "./utils/types";

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required');
}
const REDIS_URL = process.env.REDIS_URL;

export class RedisManager {
    private client: RedisClientType;
    private publisher: RedisClientType;
    private static instance: RedisManager;

    private constructor() {
        this.client = createClient({ url: REDIS_URL }) as RedisClientType;
        this.client.connect();
        this.publisher = createClient({ url: REDIS_URL }) as RedisClientType;
        this.publisher.connect();
    }

    public static getInstance() {
        if (!this.instance) {
            this.instance = new RedisManager();
        }
        return this.instance;
    }

    public sendAndAwait(message: MessageToEngine): Promise<MessageFromOrderbook> {
        return new Promise<MessageFromOrderbook>((resolve) => {
            const id = this.getRandomClientId();
            this.client.subscribe(id, (message) => {
                this.client.unsubscribe(id);
                resolve(JSON.parse(message));
            });
            this.publisher.lPush("messages", JSON.stringify({ clientId: id, message }))
        });
    }

    /** Fire-and-forget: push a message to the engine without waiting for a response.
     *  Use this for one-way messages like BALANCE_UPDATE that the engine never ACKs. */
    public pushNoReply(message: MessageToEngine): void {
        const id = this.getRandomClientId(); // engine still needs a clientId in the envelope
        this.publisher.lPush("messages", JSON.stringify({ clientId: id, message }));
    }

    private getRandomClientId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
}