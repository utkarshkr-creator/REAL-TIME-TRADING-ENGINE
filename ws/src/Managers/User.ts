import { WebSocket } from "ws";
import { SubscriptionManager } from "./RedisManager";
import { SUBSCRIBE, UNSUBSCRIBE } from "../contants";
import { IncomingMessage } from "../Utils/Types/input";
import { OutgoingMessage } from "../Utils/Types/output";
export class User {
  private id: string;
  private ws: WebSocket;
  constructor(id: string, ws: WebSocket) {
    this.id = id;
    this.ws = ws;
    this.addListeners();
  }
  private addListeners() {
    this.ws.on("message", (message: string) => {
      console.log("without parsed", message);
      const parsedMessage: IncomingMessage = JSON.parse(message);
      console.log("In user", parsedMessage);
      if (parsedMessage.method === SUBSCRIBE) {
        parsedMessage.params.forEach(s => SubscriptionManager.getInstance().subscribe(this.id, s));
      }

      if (parsedMessage.method === UNSUBSCRIBE) {
        parsedMessage.params.forEach(s => SubscriptionManager.getInstance().unsubscribe(this.id, s))
      }
    })
  }
  emit(message: OutgoingMessage) {
    this.ws.send(JSON.stringify(message));
  }

}
