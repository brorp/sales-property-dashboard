import "dotenv/config";
import { db } from "./index";
import { salesQueue } from "./schema";

async function resetQueueRewards() {
    const now = new Date();
    const rows = await db
        .update(salesQueue)
        .set({
            repeatOrderRemaining: 0,
            updatedAt: now,
        })
        .returning({ id: salesQueue.id });

    console.log(`[reset-queue-rewards] reset ${rows.length} queue reward rows`);
    process.exit(0);
}

resetQueueRewards().catch((error) => {
    console.error("[reset-queue-rewards] failed", error);
    process.exit(1);
});
