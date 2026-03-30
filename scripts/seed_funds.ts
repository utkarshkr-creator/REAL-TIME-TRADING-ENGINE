import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
    throw new Error("BASE_URL is not defined");
}
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
    throw new Error("ADMIN_SECRET is not defined");
}
const USER_IDS = ["1", "2", "3", "6", "7"];
const ASSETS = ["INR", "TATA"];
const AMOUNT = "1000000"; // Human units (will be scaled by API)

async function seed() {
    console.log(`Seeding funds to ${BASE_URL}...`);

    for (const userId of USER_IDS) {
        for (const asset of ASSETS) {
            try {
                const response = await axios.post(`${BASE_URL}/api/v1/wallet/deposit`, {
                    userId,
                    currency: asset,
                    amount: AMOUNT
                }, {
                    headers: {
                        "x-admin-secret": ADMIN_SECRET
                    }
                });
                console.log(`[OK] Seeded ${AMOUNT} ${asset} for user ${userId}: ${response.data.message}`);
            } catch (error: any) {
                console.error(`[ERR] Failed to seed ${asset} for user ${userId}:`, error.response?.data || error.message);
            }
        }
    }
}

seed();
