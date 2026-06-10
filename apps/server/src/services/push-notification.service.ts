import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { Messaging, Message } from "firebase-admin/messaging";
import { db } from "../db/index";
import { fcmToken, user as userTable, client as clientTable } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { createComponentLogger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

const logger = createComponentLogger("push-notification");

let initialized = false;

function getMessagingInstance(): Messaging | null {
    if (initialized) return getMessaging();

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled");
        return null;
    }

    try {
        let serviceAccount: any;
        const trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            serviceAccount = JSON.parse(trimmed);
        } else {
            const resolvedPath = path.resolve(process.cwd(), trimmed);
            const fileContent = fs.readFileSync(resolvedPath, "utf8");
            serviceAccount = JSON.parse(fileContent);
        }
        initializeApp({ credential: cert(serviceAccount) });
        initialized = true;
        logger.info("Firebase Admin initialized");
        return getMessaging();
    } catch (err: any) {
        // Handle case where app is already initialized (e.g. during dev hot-reloads)
        if (err.code === "app/duplicate-app") {
            initialized = true;
            return getMessaging();
        }
        logger.error("Failed to initialize Firebase Admin", err);
        return null;
    }
}

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

function getLogoUrlForClient(tenantId: string | null, clientName: string | null): string | null {
    const logoMap: Record<string, string> = {
        'avoria-001': 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-avoria.png',
    };
    const isWR = clientName?.toLowerCase().includes('residence');
    const isWV = clientName?.toLowerCase().includes('village');

    return (tenantId ? logoMap[tenantId] : null)
        ?? (isWR ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wr.png' : null)
        ?? (isWV ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wv.png' : null);
}

function buildMessages(
    tokens: { token: string; tenantId: string | null; clientName: string | null }[],
    payload: PushPayload
): Message[] {
    return tokens.map((row) => {
        const logoUrl = getLogoUrlForClient(row.tenantId, row.clientName);
        return {
            token: row.token,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data,
            webpush: {
                notification: {
                    title: payload.title,
                    body: payload.body,
                    icon: logoUrl || undefined,
                },
            },
        };
    });
}

async function removeStaleTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await db.delete(fcmToken).where(inArray(fcmToken.token, tokens));
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const messaging = getMessagingInstance();
    if (!messaging) {
        return;
    }

    const rows = await db
        .select({
            id: fcmToken.id,
            token: fcmToken.token,
            tenantId: userTable.clientId,
            clientName: clientTable.name,
        })
        .from(fcmToken)
        .leftJoin(userTable, eq(fcmToken.userId, userTable.id))
        .leftJoin(clientTable, eq(userTable.clientId, clientTable.id))
        .where(eq(fcmToken.userId, userId));

    if (!rows.length) return;

    const messages = buildMessages(rows, payload);
    try {
        const response = await messaging.sendEach(messages);
        
        const stale: string[] = [];
        response.responses.forEach((r, i) => {
            if (r.error) {
                if (r.error.code === "messaging/registration-token-not-registered") {
                    stale.push(rows[i].token);
                }
            }
        });
        
        if (stale.length) {
            await removeStaleTokens(stale);
        }
    } catch (err) {
    }
}

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!userIds.length) return;
    logger.info(`Attempting to send push notification to multiple users: [${userIds.join(", ")}]...`);
    const messaging = getMessagingInstance();
    if (!messaging) {
        logger.warn("Firebase messaging not initialized — skipping notification for multiple users");
        return;
    }

    const rows = await db
        .select({
            id: fcmToken.id,
            token: fcmToken.token,
            userId: fcmToken.userId,
            tenantId: userTable.clientId,
            clientName: clientTable.name,
        })
        .from(fcmToken)
        .leftJoin(userTable, eq(fcmToken.userId, userTable.id))
        .leftJoin(clientTable, eq(userTable.clientId, clientTable.id))
        .where(inArray(fcmToken.userId, userIds));

    logger.info(`Found ${rows.length} token(s) in DB for specified users`);
    if (!rows.length) return;

    const messages = buildMessages(rows, payload);
    try {
        const response = await messaging.sendEach(messages);
        logger.info(`FCM sendEach completed. Success count: ${response.successCount}, Failure count: ${response.failureCount}`);
        
        const stale: string[] = [];
        response.responses.forEach((r, i) => {
            if (r.error) {
                logger.warn(`FCM Send Failure for user ${rows[i].userId}: ${r.error.code} - ${r.error.message}`);
                if (r.error.code === "messaging/registration-token-not-registered") {
                    stale.push(rows[i].token);
                }
            }
        });
        
        if (stale.length) {
            logger.info(`Removing ${stale.length} stale token(s)`);
            await removeStaleTokens(stale);
        }
    } catch (err) {
        logger.error("Failed to send push notifications", err);
    }
}
