import { processExpiredAttempts } from "../services/distribution.service";
import {
    getClientBySlug,
    parseActiveWhatsAppClientSlug,
} from "../services/clients.service";
import { logger } from "../utils/logger";

const POLL_INTERVAL_MS = Number(process.env.DISTRIBUTION_POLL_MS || 15_000);

let timer: NodeJS.Timeout | null = null;
let scopedClientPromise: Promise<{ clientId: string | null; label: string }> | null = null;

async function resolveDistributionWorkerScope() {
    const activeClientSlug = parseActiveWhatsAppClientSlug();
    if (!activeClientSlug) {
        return {
            clientId: null,
            label: "all-clients",
        };
    }

    const client = await getClientBySlug(activeClientSlug);
    if (!client?.id) {
        logger.error("[distribution-worker] active client slug not found; worker paused", {
            activeClientSlug,
        });
        return {
            clientId: "__missing_client__",
            label: activeClientSlug,
        };
    }

    return {
        clientId: client.id,
        label: `${client.slug}:${client.id}`,
    };
}

function getDistributionWorkerScope() {
    if (!scopedClientPromise) {
        scopedClientPromise = resolveDistributionWorkerScope();
    }
    return scopedClientPromise;
}

export function startDistributionWorker() {
    if (timer) {
        return;
    }

    timer = setInterval(async () => {
        try {
            const scope = await getDistributionWorkerScope();
            if (scope.clientId === "__missing_client__") {
                return;
            }

            const processed = await processExpiredAttempts(scope.clientId);
            if (processed > 0) {
                logger.info(`[distribution-worker] processed ${processed} timeout attempt(s)`, {
                    scope: scope.label,
                    clientId: scope.clientId,
                });
            }
        } catch (error) {
            logger.error("[distribution-worker] failed", { error });
        }
    }, POLL_INTERVAL_MS);

    void getDistributionWorkerScope()
        .then((scope) => {
            logger.info(`[distribution-worker] started (poll=${POLL_INTERVAL_MS}ms)`, {
                scope: scope.label,
                clientId: scope.clientId,
            });
        })
        .catch((error) => {
            logger.error("[distribution-worker] failed resolving initial scope", { error });
        });
}

export function stopDistributionWorker() {
    if (!timer) {
        return;
    }
    clearInterval(timer);
    timer = null;
}
