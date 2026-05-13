/**
 * ============================================================
 * Real-Time Trading Engine — E2E Test & Performance Benchmark
 * ============================================================
 * Covers:
 *   1. Health checks  (all HTTP endpoints reachable)
 *   2. Auth flow      (signup → login → /me)
 *   3. Wallet flow    (deposit INR + TATA, verify balance)
 *   4. Order lifecycle(maker buy, maker sell, taker match)
 *   5. WebSocket      (depth, trade, ticker events)
 *   6. Klines + Trades history
 *   7. Performance benchmarks
 *      – Order submission throughput  (orders/sec)
 *      – End-to-end order latency     (p50, p90, p99 ms)
 *      – WebSocket event latency      (order placed → WS event)
 *      – Concurrent user simulation   (N users simultaneously)
 * ============================================================
 */

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';

// ── Config ─────────────────────────────────────────────────
const API_BASE  = process.env.API_URL  || 'http://localhost:3006/api/v1';
const WS_URL    = process.env.WS_URL   || 'ws://localhost:8080';
const MARKET    = 'TATA_INR';

const BENCH_ORDER_COUNT      = parseInt(process.env.BENCH_ORDERS      || '200');
const BENCH_CONCURRENT_USERS = parseInt(process.env.BENCH_CONCURRENCY || '10');

// ── Helpers ─────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function ok(label: string, val?: string) {
    passed++;
    console.log(`  ✅  ${label}${val ? '  →  ' + val : ''}`);
}

function fail(label: string, err?: any) {
    failed++;
    const msg = err?.response?.data
        ? JSON.stringify(err.response.data)
        : (err?.message || String(err));
    console.error(`  ❌  ${label}  →  ${msg}`);
}

function section(title: string) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}

function benchHeader(title: string) {
    console.log(`\n  📊  ${title}`);
    console.log('  ' + '─'.repeat(50));
}

function percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function printBenchTable(rows: [string, string | number][]) {
    rows.forEach(([k, v]) => {
        const pad = ' '.repeat(Math.max(1, 32 - k.length));
        console.log(`     ${k}${pad}${v}`);
    });
}

// ── API client factory ──────────────────────────────────────
function makeClient(token?: string): AxiosInstance {
    return axios.create({
        baseURL: API_BASE,
        timeout: 20_000,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
}

// ── Create a fresh user and return { client, userId } ───────
let userSeq = 0;
async function createUser(): Promise<{ client: AxiosInstance; userId: string; email: string }> {
    const seq = ++userSeq;
    const email    = `bench_user_${seq}_${Date.now()}@test.com`;
    const password = 'TestPass123!';
    const client   = makeClient();

    await client.post('/auth/signup', { email, password });
    const loginRes = await client.post('/auth/login', { email, password });
    const token    = loginRes.data.token;
    const userId   = loginRes.data.user.id;
    const authed   = makeClient(token);

    // Deposit funds into the Go engine
    await authed.post('/wallet/deposit', { currency: 'INR',  amount: 1_000_000 });
    await authed.post('/wallet/deposit', { currency: 'TATA', amount: 10_000    });

    // Give the engine time to process the fire-and-forget BALANCE_UPDATE messages
    await sleep(2000);

    return { client: authed, userId, email };
}

// ── WebSocket helper ────────────────────────────────────────
async function connectWS(subs: string[]): Promise<{
    ws: WebSocket;
    messages: any[];
    waitForEvent: (type: string, timeoutMs?: number) => Promise<any>;
}> {
    const messages: any[] = [];
    const ws = new WebSocket(WS_URL);

    await new Promise<void>((res, rej) => {
        ws.on('open',  res);
        ws.on('error', rej);
        setTimeout(() => rej(new Error('WS connect timeout')), 8_000);
    });

    ws.on('message', (raw: any) => {
        try { messages.push(JSON.parse(raw.toString())); } catch {}
    });

    ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: subs }));
    await sleep(500);

    function waitForEvent(evtType: string, timeoutMs = 6_000): Promise<any> {
        return new Promise((res, rej) => {
            const deadline = setTimeout(
                () => rej(new Error(`WS event '${evtType}' not received within ${timeoutMs}ms`)),
                timeoutMs
            );
            const iv = setInterval(() => {
                const found = messages.find(m =>
                    m?.data?.e === evtType || m?.type === evtType
                );
                if (found) { clearInterval(iv); clearTimeout(deadline); res(found); }
            }, 50);
        });
    }

    return { ws, messages, waitForEvent };
}

// ════════════════════════════════════════════════════════════
//  SECTION 1 — Health Checks
// ════════════════════════════════════════════════════════════
async function testHealthChecks() {
    section('SECTION 1 — Health Checks');
    const client = makeClient();

    const endpoints = [
        { label: 'GET /api/v1/tickers',            url: '/tickers'             },
        { label: `GET /api/v1/depth?symbol=${MARKET}`, url: `/depth?symbol=${MARKET}` },
        { label: `GET /api/v1/trades?symbol=${MARKET}`, url: `/trades?symbol=${MARKET}` },
    ];

    for (const ep of endpoints) {
        try {
            const res = await client.get(ep.url);
            ok(ep.label, `HTTP ${res.status}`);
        } catch (e: any) {
            fail(ep.label, e);
        }
    }

    // WebSocket reachable
    try {
        const ws = new WebSocket(WS_URL);
        await new Promise<void>((res, rej) => {
            ws.on('open',  () => { ws.close(); res(); });
            ws.on('error', rej);
            setTimeout(() => rej(new Error('timeout')), 5_000);
        });
        ok('WebSocket server reachable', WS_URL);
    } catch (e) {
        fail('WebSocket server reachable', e);
    }
}

// ════════════════════════════════════════════════════════════
//  SECTION 2 — Auth Flow
// ════════════════════════════════════════════════════════════
async function testAuthFlow() {
    section('SECTION 2 — Auth Flow');
    const client  = makeClient();
    const email   = `e2e_auth_${Date.now()}@test.com`;
    const password = 'AuthTest99!';

    // Signup
    try {
        const res = await client.post('/auth/signup', { email, password });
        ok('POST /auth/signup', `userId=${res.data.userId}`);
    } catch (e) { fail('POST /auth/signup', e); return; }

    // Duplicate signup → 400
    try {
        await client.post('/auth/signup', { email, password });
        fail('Duplicate signup should return 400 (got 2xx)');
    } catch (e: any) {
        if (e?.response?.status === 400) ok('Duplicate signup → 400');
        else fail('Duplicate signup → 400', e);
    }

    // Login
    let token = '';
    try {
        const res = await client.post('/auth/login', { email, password });
        token = res.data.token;
        ok('POST /auth/login', `token length=${token.length}`);
    } catch (e) { fail('POST /auth/login', e); return; }

    // /me
    try {
        const authed = makeClient(token);
        const res    = await authed.get('/auth/me');
        ok('GET /auth/me', `email=${res.data.email}`);
    } catch (e) { fail('GET /auth/me', e); }

    // Wrong password → 401
    try {
        await client.post('/auth/login', { email, password: 'wrongpass' });
        fail('Wrong password should return 401');
    } catch (e: any) {
        if (e?.response?.status === 401) ok('Wrong password → 401');
        else fail('Wrong password → 401', e);
    }
}

// ════════════════════════════════════════════════════════════
//  SECTION 3 — Wallet Flow
// ════════════════════════════════════════════════════════════
async function testWalletFlow() {
    section('SECTION 3 — Wallet Flow');
    const { client } = await createUser();

    try {
        const res = await client.get('/wallet/balances');
        const balances: any[] = res.data.balances;
        const inr  = balances.find(b => b.currency === 'INR');
        const tata = balances.find(b => b.currency === 'TATA');
        ok('GET /wallet/balances', `INR=${inr?.available} TATA=${tata?.available}`);

        if (parseFloat(inr?.available) > 0)  ok('INR balance > 0 after deposit');
        else fail('INR balance should be > 0 after deposit');

        if (parseFloat(tata?.available) > 0) ok('TATA balance > 0 after deposit');
        else fail('TATA balance should be > 0 after deposit');
    } catch (e) { fail('Wallet flow', e); }
}

// ════════════════════════════════════════════════════════════
//  SECTION 4 — Order Lifecycle + WebSocket Events
// ════════════════════════════════════════════════════════════
async function testOrderLifecycle() {
    section('SECTION 4 — Order Lifecycle + WebSocket Events');

    const buyer  = await createUser();
    const seller = await createUser();

    // Connect WS
    const { ws, waitForEvent } = await connectWS([
        `trade@${MARKET}`, `depth@${MARKET}`, `ticker@${MARKET}`
    ]);

    try {
        // --- Maker BUY ---
        const buyRes = await buyer.client.post('/order', {
            market: MARKET, price: '130', quantity: '5', side: 'buy', type: 'limit'
        });
        ok('Maker BUY placed', `orderId=${buyRes.data.orderId}`);

        // WS depth event
        const depthEvt = await waitForEvent('depth', 5_000).catch(() => null);
        if (depthEvt) ok('WS depth event received after BUY');
        else          fail('WS depth event not received within 5s');

        // --- Maker SELL ---
        const sellRes = await seller.client.post('/order', {
            market: MARKET, price: '150', quantity: '5', side: 'sell', type: 'limit'
        });
        ok('Maker SELL placed', `orderId=${sellRes.data.orderId}`);

        // --- Depth API ---
        const depthApiRes = await makeClient().get(`/depth?symbol=${MARKET}`);
        const bids = depthApiRes.data.bids?.length ?? 0;
        const asks = depthApiRes.data.asks?.length ?? 0;
        ok('GET /depth orderbook', `bids=${bids} asks=${asks}`);

        // --- Taker SELL (crosses spread → triggers fill) ---
        const takerRes = await seller.client.post('/order', {
            market: MARKET, price: '130', quantity: '3', side: 'sell', type: 'limit'
        });
        const fills = takerRes.data.fills ?? [];
        ok('Taker SELL placed', `orderId=${takerRes.data.orderId}`);
        if (fills.length > 0) ok(`Trade fill generated (${fills.length} fill(s))`);
        else                  fail('No fills returned – check engine connectivity');

        // WS trade event
        const tradeEvt = await waitForEvent('trade', 6_000).catch(() => null);
        if (tradeEvt) ok('WS trade event received after match');
        else          fail('WS trade event not received within 6s');

        // --- Cancel open order ---
        const cancelRes = await buyer.client.delete('/order', {
            data: { market: MARKET, orderId: buyRes.data.orderId }
        });
        ok('DELETE /order (cancel)', `status=${cancelRes.status}`);

    } catch (e) {
        fail('Order lifecycle', e);
    } finally {
        ws.close();
    }
}

// ════════════════════════════════════════════════════════════
//  SECTION 5 — Klines + Trade History
// ════════════════════════════════════════════════════════════
async function testKlinesAndTrades() {
    section('SECTION 5 — Klines & Trade History');
    const client = makeClient();

    try {
        const now   = Math.floor(Date.now() / 1000);
        const start = now - 3_600;
        const end   = now + 3_600;
        const res   = await client.get(`/klines?symbol=${MARKET}&interval=1m&startTime=${start}&endTime=${end}`);
        ok('GET /klines', `${res.data?.length ?? 0} candles returned`);
    } catch (e) { fail('GET /klines', e); }

    try {
        const res = await client.get(`/trades?symbol=${MARKET}`);
        ok('GET /trades', `${res.data?.length ?? 0} trades in history`);
    } catch (e) { fail('GET /trades', e); }
}

// ════════════════════════════════════════════════════════════
//  SECTION 6 — Performance Benchmark: Order Throughput
// ════════════════════════════════════════════════════════════
async function benchOrderThroughput() {
    section('SECTION 6 — Benchmark: Order Submission Throughput');
    benchHeader(`Submitting ${BENCH_ORDER_COUNT} sequential limit orders`);

    const { client } = await createUser();
    const latencies: number[] = [];

    let basePrice = 100;
    const t0 = Date.now();

    for (let i = 0; i < BENCH_ORDER_COUNT; i++) {
        const price = (basePrice + (i % 20) * 0.5).toFixed(2); // vary price
        const start = Date.now();
        try {
            await client.post('/order', {
                market: MARKET, price, quantity: '1', side: 'buy', type: 'limit'
            });
            latencies.push(Date.now() - start);
        } catch {
            // count error but continue
            latencies.push(Date.now() - start);
        }
    }

    const totalMs = Date.now() - t0;
    const sorted  = [...latencies].sort((a, b) => a - b);
    const avg     = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const tps     = (BENCH_ORDER_COUNT / (totalMs / 1000)).toFixed(1);

    printBenchTable([
        ['Total orders',        BENCH_ORDER_COUNT],
        ['Total time (ms)',     totalMs],
        ['Throughput (orders/s)', tps],
        ['Avg latency (ms)',    avg.toFixed(1)],
        ['p50 latency (ms)',    percentile(sorted, 50)],
        ['p90 latency (ms)',    percentile(sorted, 90)],
        ['p99 latency (ms)',    percentile(sorted, 99)],
        ['Min latency (ms)',    sorted[0]],
        ['Max latency (ms)',    sorted[sorted.length - 1]],
    ]);

    ok(`Throughput benchmark complete — ${tps} orders/sec`);
}

// ════════════════════════════════════════════════════════════
//  SECTION 7 — Performance Benchmark: Concurrent Users
// ════════════════════════════════════════════════════════════
async function benchConcurrentUsers() {
    section('SECTION 7 — Benchmark: Concurrent Users');
    benchHeader(`${BENCH_CONCURRENT_USERS} users placing orders simultaneously`);

    const users: { client: AxiosInstance }[] = [];
    console.log(`     Creating ${BENCH_CONCURRENT_USERS} test users…`);
    for (let i = 0; i < BENCH_CONCURRENT_USERS; i++) {
        users.push(await createUser());
    }

    const latencies: number[] = [];
    const t0 = Date.now();

    const tasks = users.map(async ({ client }, idx) => {
        const price = (100 + idx).toFixed(2);
        const start = Date.now();
        try {
            await client.post('/order', {
                market: MARKET, price, quantity: '1', side: 'buy', type: 'limit'
            });
        } catch {}
        latencies.push(Date.now() - start);
    });

    await Promise.all(tasks);
    const totalMs = Date.now() - t0;
    const sorted  = [...latencies].sort((a, b) => a - b);
    const avg     = latencies.reduce((s, v) => s + v, 0) / latencies.length;

    printBenchTable([
        ['Concurrent users',    BENCH_CONCURRENT_USERS],
        ['Wall-clock time (ms)', totalMs],
        ['Avg latency (ms)',    avg.toFixed(1)],
        ['p50 latency (ms)',    percentile(sorted, 50)],
        ['p99 latency (ms)',    percentile(sorted, 99)],
        ['Max latency (ms)',    sorted[sorted.length - 1]],
    ]);

    ok(`Concurrent benchmark complete — wall time ${totalMs}ms`);
}

// ════════════════════════════════════════════════════════════
//  SECTION 8 — WebSocket Event Latency
// ════════════════════════════════════════════════════════════
async function benchWSLatency() {
    section('SECTION 8 — Benchmark: WebSocket Event Latency');
    benchHeader('Time from order POST → WS trade/depth event (10 taker orders)');

    const buyer  = await createUser();
    const seller = await createUser();

    const { ws, waitForEvent } = await connectWS([
        `trade@${MARKET}`, `depth@${MARKET}`
    ]);

    // Seed some maker liquidity
    for (let i = 0; i < 15; i++) {
        const price = (120 + i * 0.5).toFixed(2);
        await buyer.client.post('/order', {
            market: MARKET, price, quantity: '2', side: 'buy', type: 'limit'
        });
    }
    await sleep(1000); // let engine process

    const latencies: number[] = [];
    const RUNS = 10;

    for (let i = 0; i < RUNS; i++) {
        const price = (120 + (i % 5) * 0.5).toFixed(2);
        const t0 = Date.now();
        try {
            await seller.client.post('/order', {
                market: MARKET, price, quantity: '1', side: 'sell', type: 'limit'
            });
            // wait for any WS event (depth or trade) as signal
            await waitForEvent('depth', 3000).catch(() => waitForEvent('trade', 3000));
            latencies.push(Date.now() - t0);
        } catch {
            // skip
        }
        await sleep(200);
    }

    ws.close();

    if (latencies.length > 0) {
        const sorted = [...latencies].sort((a, b) => a - b);
        const avg    = latencies.reduce((s, v) => s + v, 0) / latencies.length;
        printBenchTable([
            ['Samples',           latencies.length],
            ['Avg (ms)',          avg.toFixed(1)],
            ['p50 (ms)',          percentile(sorted, 50)],
            ['p90 (ms)',          percentile(sorted, 90)],
            ['p99 (ms)',          percentile(sorted, 99)],
            ['Min (ms)',          sorted[0]],
            ['Max (ms)',          sorted[sorted.length - 1]],
        ]);
        ok(`WS latency benchmark complete`);
    } else {
        fail('WS latency — no successful samples (is market maker running?)');
    }
}

// ════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════
async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║   REAL-TIME TRADING ENGINE — E2E TEST & BENCHMARK SUITE  ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  API   : ${API_BASE}`);
    console.log(`  WS    : ${WS_URL}`);
    console.log(`  Market: ${MARKET}`);
    console.log(`  Bench orders: ${BENCH_ORDER_COUNT}  |  Concurrent users: ${BENCH_CONCURRENT_USERS}`);

    const start = Date.now();

    await testHealthChecks();
    await testAuthFlow();
    await testWalletFlow();
    await testOrderLifecycle();
    await testKlinesAndTrades();
    await benchOrderThroughput();
    await benchConcurrentUsers();
    await benchWSLatency();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  RESULTS:  ✅ ${passed} passed   ❌ ${failed} failed   ⏱ ${elapsed}s`);
    console.log('═'.repeat(60) + '\n');

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error('\n💥  Fatal error:', err?.message || err);
    process.exit(1);
});
