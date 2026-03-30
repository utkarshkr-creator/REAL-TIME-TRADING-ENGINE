"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const USER_IDS = ["1", "2", "3", "6", "7"];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Initializing users...");
        for (const id of USER_IDS) {
            try {
                const user = yield prisma.user.upsert({
                    where: { id },
                    update: {},
                    create: {
                        id,
                        email: `mm${id}@example.com`,
                        password: "dummy-password-not-used"
                    }
                });
                console.log(`[OK] User ${id} ready: ${user.email}`);
            }
            catch (error) {
                console.error(`[ERR] Failed to init user ${id}:`, error);
            }
        }
        yield prisma.$disconnect();
    });
}
main();
