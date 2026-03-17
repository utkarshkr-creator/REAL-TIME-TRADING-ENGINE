import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-me";

// Augment the Express Request type to include userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const adminSecret = req.headers["x-admin-secret"];

    // Allow bypass for internal services if secret matches
    if (adminSecret && adminSecret === JWT_SECRET) {
        // If it's an admin request, they can specify the userId in the body or query
        const bodyUserId = req.body?.userId;
        const queryUserId = req.query?.userId as string;

        if (bodyUserId || queryUserId) {
            req.userId = bodyUserId || queryUserId;
            return next();
        }
    }

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization token" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
