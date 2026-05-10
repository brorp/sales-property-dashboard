import "dotenv/config";
import { isNull } from "drizzle-orm";
import { db } from "./index";
import { lead } from "./schema";
import { ensureLeadCode } from "../services/lead-code.service";

async function backfillLeadCodes() {
    const rows = await db
        .select({
            id: lead.id,
        })
        .from(lead)
        .where(isNull(lead.leadCode));

    let updated = 0;
    for (const row of rows) {
        await ensureLeadCode(row.id);
        updated += 1;
    }

    console.log(`[backfill-lead-codes] updated ${updated} lead rows`);
    process.exit(0);
}

backfillLeadCodes().catch((error) => {
    console.error("[backfill-lead-codes] failed", error);
    process.exit(1);
});
