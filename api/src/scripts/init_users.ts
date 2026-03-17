import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_IDS = ["1", "2", "3", "6", "7"];

async function main() {
    console.log("Initializing users...");
    for (const id of USER_IDS) {
        try {
            const user = await prisma.user.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    email: `mm${id}@example.com`,
                    password: "dummy-password-not-used"
                }
            });
            console.log(`[OK] User ${id} ready: ${user.email}`);
        } catch (error) {
            console.error(`[ERR] Failed to init user ${id}:`, error);
        }
    }
    await prisma.$disconnect();
}

main();
