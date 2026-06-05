import * as admin from "firebase-admin";
import { db } from "../db/index";
import { fcmToken } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { createComponentLogger } from "../utils/logger";

const logger = createComponentLogger("push-notification");

let initialized = false;

function getApp(): admin.app.App | null {
    if (initialized) return admin.app();

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled");
        return null;
    }

    try {
        const serviceAccount = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        initialized = true;
        logger.info("Firebase Admin initialized");
        return admin.app();
    } catch {
        logger.error("Failed to initialize Firebase Admin");
        return null;
    }
}

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

async function getTokensForUser(userId: string): Promise<{ id: string; token: string }[]> {
    return db
        .select({ id: fcmToken.id, token: fcmToken.token })
        .from(fcmToken)
        .where(eq(fcmToken.userId, userId));
}

async function removeStaleTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await db.delete(fcmToken).where(inArray(fcmToken.token, tokens));
}

function buildMessages(tokens: string[], payload: PushPayload): admin.messaging.Message[] {
    return tokens.map((token) => ({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        webpush: {
            notification: {
                title: payload.title,
                body: payload.body,
                icon: "/icon-192.png",
                badge: "/badge-72.png",
            },
        },
    }));
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const app = getApp();
    if (!app) return;

    const rows = await getTokensForUser(userId);
    if (!rows.length) return;

    const messages = buildMessages(rows.map((r) => r.token), payload);
    try {
        const response = await app.messaging().sendEach(messages);
        const stale: string[] = [];
        response.responses.forEach((r, i) => {
            if (r.error?.code === "messaging/registration-token-not-registered") {
                stale.push(rows[i].token);
            }
        });
        await removeStaleTokens(stale);
    } catch {
        logger.error(`Failed to send push notification to user ${userId}`);
    }
}

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!userIds.length) return;
    const app = getApp();
    if (!app) return;

    const rows = await db
        .select({ id: fcmToken.id, token: fcmToken.token })
        .from(fcmToken)
        .where(inArray(fcmToken.userId, userIds));

    if (!rows.length) return;

    const messages = buildMessages(rows.map((r) => r.token), payload);
    try {
        const response = await app.messaging().sendEach(messages);
        const stale: string[] = [];
        response.responses.forEach((r, i) => {
            if (r.error?.code === "messaging/registration-token-not-registered") {
                stale.push(rows[i].token);
            }
        });
        await removeStaleTokens(stale);
    } catch {
        logger.error("Failed to send push notifications");
    }
}
