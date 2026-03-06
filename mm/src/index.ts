import axios from "axios";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = "http://localhost:3006";
const MARKET = "TATA_INR";
const USER_IDS = ["1", "2", "3", "6", "7"];

// Precision — must match API's DECIMAL_PRECISION env var
const DECIMAL_PRECISION = parseInt(process.env.DECIMAL_PRECISION || "6", 10);
const SCALING_FACTOR = Math.pow(10, DECIMAL_PRECISION);

// Market maker params
const LADDER_LEVELS = 10;       // Quote levels on each side
const BASE_SPREAD_BPS = 30;       // Base half-spread in basis points (e.g. 30bps = 0.3%)
const LEVEL_STEP_BPS = 10;       // Extra bps per ladder level away from mid
// Keep qty small: engine cost = price_scaled * qty_scaled, so 1000 * 0.001 * 1e12 = 1e12 per order
const BASE_QTY = 0.001;        // Base order size per level (human units)
const QTY_STEP = 0.0005;       // Extra qty per level
const FALLBACK_MID = 1000;     // Mid to use if orderbook is empty
const INTERVAL_MS = 1500;     // Cycle interval

// Inventory tracking per user
const inventory: Record<string, number> = {};
for (const u of USER_IDS) inventory[u] = 0; // positive = long TATA, negative = short

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function randomUser(): string {
  return USER_IDS[Math.floor(Math.random() * USER_IDS.length)];
}

/** Round a human price to 5 decimal places (max allowed by API) */
function fmtPrice(p: number): string {
  return parseFloat(p.toFixed(5)).toString();
}

/** Round qty to 5 decimal places */
function fmtQty(q: number): string {
  return parseFloat(q.toFixed(5)).toString();
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
async function getMidPrice(): Promise<number> {
  try {
    const resp = await axios.get(
      `${BASE_URL}/api/v1/depth?symbol=${MARKET}`,
      { timeout: 2000 }
    );
    const bids: string[][] = resp.data?.bids ?? [];
    const asks: string[][] = resp.data?.asks ?? [];

    if (bids.length === 0 && asks.length === 0) return FALLBACK_MID;

    // Best bid = highest bid price, best ask = lowest ask price (engine returns scaled ints)
    const bestBid = bids.length > 0
      ? Math.max(...bids.map(([p]) => Number(p))) / SCALING_FACTOR
      : NaN;
    const bestAsk = asks.length > 0
      ? Math.min(...asks.map(([p]) => Number(p))) / SCALING_FACTOR
      : NaN;

    if (!isNaN(bestBid) && !isNaN(bestAsk)) return (bestBid + bestAsk) / 2;
    if (!isNaN(bestBid)) return bestBid;
    if (!isNaN(bestAsk)) return bestAsk;
    return FALLBACK_MID;
  } catch {
    return FALLBACK_MID;
  }
}

async function getOpenOrders(userId: string): Promise<any[]> {
  try {
    const resp = await axios.get(
      `${BASE_URL}/api/v1/order/open?userId=${userId}&market=${MARKET}`,
      { timeout: 2000 }
    );
    return Array.isArray(resp.data) ? resp.data : [];
  } catch {
    return [];
  }
}

async function cancelOrder(orderId: string): Promise<void> {
  try {
    await axios.delete(`${BASE_URL}/api/v1/order`, {
      data: { orderId, market: MARKET },
      timeout: 2000,
    });
  } catch { /* ignore */ }
}

async function placeOrder(
  side: "buy" | "sell",
  humanPrice: number,
  humanQty: number,
  userId: string
): Promise<boolean> {
  try {
    await axios.post(`${BASE_URL}/api/v1/order`, {
      market: MARKET,
      price: fmtPrice(humanPrice),
      quantity: fmtQty(humanQty),
      side,
      userId,
    }, { timeout: 3000 });
    // Update inventory tracking
    inventory[userId] = (inventory[userId] ?? 0) + (side === "buy" ? humanQty : -humanQty);
    return true;
  } catch (e: any) {
    const msg = e?.response?.data || e.message;
    console.warn(`[MM] ✗ ${side} ${fmtQty(humanQty)} @ ${fmtPrice(humanPrice)} (u${userId}): ${msg}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main market-making cycle
// ---------------------------------------------------------------------------
async function runCycle() {
  const mid = await getMidPrice();

  // Randomly pick one user to manage per cycle
  const userId = randomUser();
  const openOrders = await getOpenOrders(userId);
  const openBids = openOrders.filter((o) => o.side === "buy");
  const openAsks = openOrders.filter((o) => o.side === "sell");

  // Inventory skew: if long, push bids down and asks down to sell; if short, push both up
  const inv = inventory[userId] ?? 0;
  const invSkewBps = Math.max(-200, Math.min(200, inv * 5)); // cap at ±200bps skew

  // Cancel stale orders (ones outside our desired ladder range or random refresh)
  const halfSpreadBase = (mid * BASE_SPREAD_BPS) / 10000;
  const maxBidPrice = mid - halfSpreadBase * 0.5;  // any bid above this is too tight (potential cross)
  const minAskPrice = mid + halfSpreadBase * 0.5;

  const cancelPromises: Promise<void>[] = [];
  for (const o of openBids) {
    const p = Number(o.price) / SCALING_FACTOR;
    if (p > maxBidPrice || Math.random() < 0.2) cancelPromises.push(cancelOrder(o.orderId));
  }
  for (const o of openAsks) {
    const p = Number(o.price) / SCALING_FACTOR;
    if (p < minAskPrice || Math.random() < 0.2) cancelPromises.push(cancelOrder(o.orderId));
  }
  await Promise.all(cancelPromises);
  const cancelledBids = openBids.filter((o) => {
    const p = Number(o.price) / SCALING_FACTOR;
    return p > maxBidPrice || Math.random() < 0.2;
  }).length;
  const cancelledAsks = openAsks.filter((o) => {
    const p = Number(o.price) / SCALING_FACTOR;
    return p < minAskPrice || Math.random() < 0.2;
  }).length;

  const bidsToAdd = Math.max(0, LADDER_LEVELS - openBids.length + cancelledBids);
  const asksToAdd = Math.max(0, LADDER_LEVELS - openAsks.length + cancelledAsks);

  const placePromises: Promise<boolean>[] = [];

  // Tiered bid ladder: place levels at increasing distance below mid
  for (let i = 0; i < bidsToAdd; i++) {
    const levelBps = BASE_SPREAD_BPS + LEVEL_STEP_BPS * i - invSkewBps;
    const bidPrice = mid * (1 - levelBps / 10000);
    const qty = BASE_QTY + QTY_STEP * i;
    placePromises.push(placeOrder("buy", bidPrice, qty, randomUser()));
  }

  // Tiered ask ladder: place levels at increasing distance above mid
  for (let i = 0; i < asksToAdd; i++) {
    const levelBps = BASE_SPREAD_BPS + LEVEL_STEP_BPS * i + invSkewBps;
    const askPrice = mid * (1 + levelBps / 10000);
    const qty = BASE_QTY + QTY_STEP * i;
    placePromises.push(placeOrder("sell", askPrice, qty, randomUser()));
  }

  const results = await Promise.all(placePromises);
  const placed = results.filter(Boolean).length;

  console.log(
    `[MM] mid=${mid.toFixed(2)} | bids=${openBids.length}(+${bidsToAdd}) asks=${openAsks.length}(+${asksToAdd}) | placed=${placed} | inv[u${userId}]=${(inventory[userId] ?? 0).toFixed(1)}`
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
console.log(`[MM] Market Maker started | market=${MARKET} mid=~${FALLBACK_MID} precision=1e${DECIMAL_PRECISION}`);

async function loop() {
  try {
    await runCycle();
  } catch (e: any) {
    console.error("[MM] cycle error:", e.message);
  }
  setTimeout(loop, INTERVAL_MS);
}

loop();
