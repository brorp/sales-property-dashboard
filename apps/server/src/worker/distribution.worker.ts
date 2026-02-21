import { processExpiredAttempts } from "../services/distribution.service";

const POLL_INTERVAL_MS = Number(process.env.DISTRIBUTION_POLL_MS || 15_000);

let timer: NodeJS.Timeout | null = null;

export function startDistributionWorker() {
    if (timer) {
        return;
    }

    timer = setInterval(async () => {
        try {
            const processed = await processExpiredAttempts();
            if (processed > 0) {
                console.log(`[distribution-worker] processed ${processed} timeout attempt(s)`);
            }
        } catch (error) {
            console.error("[distribution-worker] failed:", error);
        }
    }, POLL_INTERVAL_MS);

    console.log(`[distribution-worker] started (poll=${POLL_INTERVAL_MS}ms)`);
}

export function stopDistributionWorker() {
    if (!timer) {
        return;
    }
    clearInterval(timer);
    timer = null;
}
