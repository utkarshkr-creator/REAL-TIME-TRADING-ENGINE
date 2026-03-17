const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
    console.log("[TEST] Connected to WS");
    ws.send(JSON.stringify({
        "method": "SUBSCRIBE",
        "params": ["trade@TATA_INR", "depth@TATA_INR", "ticker@TATA_INR"]
    }));

    setTimeout(() => {
        console.log("[TEST] Closing");
        ws.close();
        process.exit(0);
    }, 5000);
});

ws.on('message', (msg) => {
    console.log("[TEST] MSG RECEIVED:", msg.toString());
});

ws.on('error', (err) => {
    console.error("[TEST] Error:", err);
});
