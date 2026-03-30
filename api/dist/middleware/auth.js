"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-me";
const authMiddleware = (req, res, next) => {
    var _a, _b;
    const authHeader = req.headers.authorization;
    const adminSecret = req.headers["x-admin-secret"];
    // Allow bypass for internal services if secret matches
    if (adminSecret && adminSecret === JWT_SECRET) {
        // If it's an admin request, they can specify the userId in the body or query
        const bodyUserId = (_a = req.body) === null || _a === void 0 ? void 0 : _a.userId;
        const queryUserId = (_b = req.query) === null || _b === void 0 ? void 0 : _b.userId;
        if (bodyUserId || queryUserId) {
            req.userId = bodyUserId || queryUserId;
            return next();
        }
    }
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))) {
        return res.status(401).json({ error: "Missing or invalid authorization token" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
exports.authMiddleware = authMiddleware;
