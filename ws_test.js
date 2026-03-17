const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
    ws.send(JSON.stringify({"method":"SUBSCRIBE","params":["trade@TATA_INR"]}));
    setTimeout(() => { ws.close(); process.exit(0); }, 5000);
});
ws.on('message', (msg) => {
    console.log("MSG RECEIVED:", msg.toString());
});
