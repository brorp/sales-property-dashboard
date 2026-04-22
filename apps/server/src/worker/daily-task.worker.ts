import { generateFollowUpTasks } from "../services/daily-task.service";
import { processMissedDailyTasks } from "../services/daily-task-penalty.service";
import { logger } from "../utils/logger";

const DAILY_TASK_WORKER_POLL_MS = Number(
    process.env.DAILY_TASK_WORKER_POLL_MS || 60 * 60 * 1000
);

let timer: NodeJS.Timeout | null = null;

async function tick() {
    const now = new Date();

    try {
        const [generatedFollowUps, createdPenalties] = await Promise.all([
            generateFollowUpTasks(now),
            processMissedDailyTasks(now),
        ]);

        logger.info("[daily-task-worker] completed", {
            generatedFollowUps,
            createdPenalties,
            runAt: now.toISOString(),
        });
    } catch (error) {
        logger.error("[daily-task-worker] failed", {
            runAt: now.toISOString(),
            error,
        });
    }
}

export function startDailyTaskWorker() {
    if (timer) {
        return;
    }

    timer = setInterval(() => {
        void tick();
    }, DAILY_TASK_WORKER_POLL_MS);

    logger.info("[daily-task-worker] started", {
        pollMs: DAILY_TASK_WORKER_POLL_MS,
    });

    void tick();
}

export function stopDailyTaskWorker() {
    if (!timer) {
        return;
    }

    clearInterval(timer);
    timer = null;
}
