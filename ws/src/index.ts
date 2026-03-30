import { WebSocketServer } from 'ws';
import { UserManager } from './Managers/UserManager';

if (!process.env.PORT) {
  throw new Error('PORT environment variable is required');
}
const port = parseInt(process.env.PORT, 10);
const wss = new WebSocketServer({ port });

wss.on('connection', function connection(ws) {
  UserManager.getInstance().addUser(ws);
});

