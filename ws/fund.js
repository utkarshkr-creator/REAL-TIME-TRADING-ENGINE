const { createClient } = require('redis');

async function run() {
    const client = createClient({ url: "redis://localhost:6379" });
    await client.connect();

    const users = ['1', '2', '3', '6', '7'];
    const assets = ['INR', 'TATA'];
    const amount = "1000000000000"; // huge amount

    for (const u of users) {
        for (const a of assets) {
            const payload = {
                type: "BALANCE_UPDATE",
                data: {
                    userId: u,
                    currency: a,
                    amount: amount
                }
            };
            await client.lPush("messages", JSON.stringify(payload));
        }
    }
    console.log("Funded users");
    process.exit(0);
}
run();
