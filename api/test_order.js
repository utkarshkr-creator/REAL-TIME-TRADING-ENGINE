const { createClient } = require('redis');
async function test() {
    const pub = createClient({url: "redis://localhost:6379"});
    const sub = createClient({url: "redis://localhost:6379"});
    await pub.connect();
    await sub.connect();
    
    const clientId = "test12345";
    await sub.subscribe(clientId, (msg) => {
        console.log("RECEIVED REPLY:", msg);
        process.exit(0);
    });
    
    const wrapper = {
        clientId: clientId,
        message: {
            type: "CREATE_ORDER",
            data: {
                market: "TATA_INR",
                price: "138",
                quantity: "10",
                side: "buy",
                userId: "1"
            }
        }
    };
    
    console.log("Pushing to messages...");
    await pub.lPush("messages", JSON.stringify(wrapper));
}
test();
