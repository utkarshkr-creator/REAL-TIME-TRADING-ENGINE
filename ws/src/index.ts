import { WebSocketServer } from 'ws';
import { UserManager } from './Managers/UserManager';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', function connection(ws) {
  UserManager.getInstance().addUser(ws);
});

