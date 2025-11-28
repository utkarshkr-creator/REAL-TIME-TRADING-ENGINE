"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const Engine_1 = require("../trade/Engine");
const fromApi_1 = require("../Types/fromApi");
// Mock RedisManager
const publishMessageMock = vitest_1.vi.fn();
vitest_1.vi.mock("../RedisManager", () => ({
    RedisManager: {
        getInstance: () => ({
            publishMessage: publishMessageMock,
            sendToApi: vitest_1.vi.fn(),
            pushMessage: vitest_1.vi.fn()
        })
    }
}));
(0, vitest_1.describe)("Engine Depth Updates - Single Order", () => {
    (0, vitest_1.it)("should publish depth update for a single unmatched BUY order", () => {
        const engine = new Engine_1.Engine();
        const market = "TATA_INR";
        const price = "1000";
        const quantity = "10";
        // Place a BUY order (Maker) - No match expected
        engine.process({
            message: {
                type: fromApi_1.CREATE_ORDER,
                data: {
                    market,
                    price,
                    quantity,
                    side: "buy",
                    userId: "1"
                }
            },
            clientId: "1"
        });
        // Check depth update
        const depthCalls = publishMessageMock.mock.calls.filter(call => call[0] === `depth@${market}`);
        (0, vitest_1.expect)(depthCalls.length).toBeGreaterThan(0);
        const lastDepthCall = depthCalls[depthCalls.length - 1];
        const payload = lastDepthCall[1];
        const data = payload.data;
        console.log("Depth Update Data:", JSON.stringify(data, null, 2));
        // Expect bids to contain [price, quantity]
        // Expect asks to be empty
        const bidUpdate = data.b.find((x) => x[0] === price);
        (0, vitest_1.expect)(bidUpdate).toBeDefined();
        (0, vitest_1.expect)(bidUpdate[1]).toBe(quantity);
        (0, vitest_1.expect)(data.a.length).toBe(0);
    });
    (0, vitest_1.it)("should publish depth update for a single unmatched SELL order", () => {
        const engine = new Engine_1.Engine();
        const market = "TATA_INR";
        const price = "1001";
        const quantity = "5";
        publishMessageMock.mockClear();
        // Place a SELL order (Maker) - No match expected
        engine.process({
            message: {
                type: fromApi_1.CREATE_ORDER,
                data: {
                    market,
                    price,
                    quantity,
                    side: "sell",
                    userId: "2"
                }
            },
            clientId: "2"
        });
        // Check depth update
        const depthCalls = publishMessageMock.mock.calls.filter(call => call[0] === `depth@${market}`);
        (0, vitest_1.expect)(depthCalls.length).toBeGreaterThan(0);
        const lastDepthCall = depthCalls[depthCalls.length - 1];
        const payload = lastDepthCall[1];
        const data = payload.data;
        console.log("Depth Update Data:", JSON.stringify(data, null, 2));
        // Expect asks to contain [price, quantity]
        // Expect bids to be empty
        const askUpdate = data.a.find((x) => x[0] === price);
        (0, vitest_1.expect)(askUpdate).toBeDefined();
        (0, vitest_1.expect)(askUpdate[1]).toBe(quantity);
        (0, vitest_1.expect)(data.b.length).toBe(0);
    });
});
