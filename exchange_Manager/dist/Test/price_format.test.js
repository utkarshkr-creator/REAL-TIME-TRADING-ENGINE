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
(0, vitest_1.describe)("Engine Depth Updates - Price Formatting", () => {
    (0, vitest_1.it)("should publish depth update when price string differs from number string representation", () => {
        const engine = new Engine_1.Engine();
        const market = "TATA_INR";
        const price = "1000.00"; // User sends "1000.00"
        const quantity = "10";
        // Place a BUY order
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
        // The price in depth update should match the canonical form (e.g. "1000") 
        // OR the code should handle the mismatch and find the entry.
        // If the code uses `price` ("1000.00") to find in depth (which has "1000"), it will fail to find it,
        // and thus `updatedBid` will be undefined, and `b` will be `[]`.
        (0, vitest_1.expect)(data.b.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(data.b[0][1]).toBe(quantity);
    });
});
