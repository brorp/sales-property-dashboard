import { getClientBySlug, parseActiveWhatsAppClientSlug } from "../services/clients.service";
import { processPendingWhatsAppOutbox } from "../services/whatsapp-outbox.service";
import { createComponentLogger } from "../utils/logger";

const workerLogger = createComponentLogger("wa:outbox-worker");
const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.WA_OUTBOX_POLL_MS || 15_000));

let timer: NodeJS.Timeout | null = null;
let clientIdPromise: Promise<string | null> | null = null;
let running = false;

async function resolveClientId() {
    const slug = parseActiveWhatsAppClientSlug();
    if (!slug) {
        workerLogger.error("WhatsApp outbox worker requires WA_ACTIVE_CLIENT_SLUG");
        return null;
    }
    const activeClient = await getClientBySlug(slug);
    if (!activeClient?.id) {
        workerLogger.error("WhatsApp outbox worker client was not found", { slug });
        return null;
    }
    return activeClient.id;
}

function getClientId() {
    if (!clientIdPromise) {
        clientIdPromise = resolveClientId();
    }
    return clientIdPromise;
}

async function poll() {
    if (running) {
        return;
    }
    running = true;
    try {
        const clientId = await getClientId();
        if (!clientId) {
            return;
        }
        const processed = await processPendingWhatsAppOutbox(clientId);
        if (processed > 0) {
            workerLogger.info("Durable WhatsApp replies processed", { clientId, processed });
        }
    } catch (error) {
        workerLogger.error("WhatsApp outbox poll failed", { error });
    } finally {
        running = false;
    }
}

export function startWhatsAppOutboxWorker() {
    if (timer) {
        return;
    }
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    timer.unref?.();
    void poll();
    workerLogger.info("WhatsApp outbox worker started", { pollIntervalMs: POLL_INTERVAL_MS });
}

export function stopWhatsAppOutboxWorker() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
