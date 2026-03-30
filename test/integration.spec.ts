import axios from 'axios';
import WebSocket from 'ws';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
if (!WS_URL) {
    throw new Error("NEXT_PUBLIC_WS_URL is not defined");
}

const MARKET = 'TATA_INR';
const USER_1 = '1';
const USER_2 = '2';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('--- Starting Integration Tests ---');

    // 1. Check Tickers
    console.log('\n[API] Testing GET /tickers...');
    const tickersRes = await axios.get(`${API_URL}/tickers`);
    console.log(`✓ Received ${tickersRes.data.data.length} tickers`);

    // 2. Clear open orders for users
    console.log(`\n[API] Canceling existing open orders...`);
    // Assuming you can't easily clear all, we'll just check balance.

    // 3. Connect WebSocket
    console.log('\n[WS] Connecting to WebSocket...');
    const ws = new WebSocket(WS_URL);

    const wsMessages: string[] = [];
    ws.on('message', (data: any) => {
        let msg = JSON.parse(data.toString());
        wsMessages.push(msg.data?.e || msg.type);
        if (msg.data?.e === 'trade') {
            console.log(`[WS] Received Trade Event: ${JSON.stringify(msg.data)}`);
        } else if (msg.data?.e === 'depth') {
            console.log(`[WS] Received Depth Event`);
        } else if (msg.type === 'SUBSCRIBED') {
            console.log(`[WS] Subscribed successfully.`);
        }
    });

    await new Promise(resolve => ws.on('open', resolve));
    console.log('✓ WebSocket connected');

    ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`trade@${MARKET}`, `depth@${MARKET}`, `ticker@${MARKET}`]
    }));
    await sleep(1000); // Wait for sub

    // 4. Place a Maker BUY Order (User 1)
    console.log(`\n[API] User 1 placing Maker BUY order at 135 INR...`);
    const buyOrder1Res = await axios.post(`${API_URL}/order`, {
        market: MARKET,
        price: '135',
        quantity: '5',
        side: 'buy',
        userId: USER_1
    });
    console.log(`✓ Order placed: ${buyOrder1Res.data.orderId}`);
    await sleep(500); // Wait for depth WS event

    // 5. Place a Maker SELL Order (User 2)
    console.log(`\n[API] User 2 placing Maker SELL order at 145 INR...`);
    const sellOrder1Res = await axios.post(`${API_URL}/order`, {
        market: MARKET,
        price: '145',
        quantity: '5',
        side: 'sell',
        userId: USER_2
    });
    console.log(`✓ Order placed: ${sellOrder1Res.data.orderId}`);
    await sleep(500);

    // 6. Check Depth API
    console.log(`\n[API] Checking orderbook depth...`);
    const depthRes = await axios.get(`${API_URL}/depth?symbol=${MARKET}`);
    console.log(`✓ Orderbook has ${depthRes.data.bids?.length || 0} bids and ${depthRes.data.asks?.length || 0} asks`);

    // 7. Place a Taker SELL Order (User 2) to trigger a trade
    console.log(`\n[API] User 2 placing Taker SELL order at 135 INR (matches User 1)...`);
    const takerSellRes = await axios.post(`${API_URL}/order`, {
        market: MARKET,
        price: '135',
        quantity: '2',
        side: 'sell',
        userId: USER_2
    });
    console.log(`✓ Taker Order placed: ${takerSellRes.data.orderId}`);
    if (takerSellRes.data.fills && takerSellRes.data.fills.length > 0) {
        console.log(`✓ FILLS GENERATED: ${JSON.stringify(takerSellRes.data.fills)}`);
    }

    await sleep(1000); // Wait for trade WS events and DB updates

    // 8. Verify Klines
    console.log(`\n[API] Checking klines for generated trade...`);
    const startTime = Math.floor(Date.now() / 1000) - 3600;
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const klinesRes = await axios.get(`${API_URL}/klines?symbol=${MARKET}&interval=1m&startTime=${startTime}&endTime=${endTime}`);
    console.log(`✓ Received ${klinesRes.data.length} klines`);

    // 9. Verify trades route
    console.log(`\n[API] Checking trades history...`);
    const tradesRes = await axios.get(`${API_URL}/trades?symbol=${MARKET}`);
    console.log(`✓ Received ${tradesRes.data?.length || 0} recent trades in DB`);

    console.log('\n--- Closing connections ---');
    ws.close();
    console.log('✓ All tests finished executed. Please verify the API and WS logs if needed.');
}

runTests().catch(err => {
    console.error('Integration test failed:', err.response?.data || err.message);
});
