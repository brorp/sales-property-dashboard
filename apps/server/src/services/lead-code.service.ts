import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { lead } from "../db/schema";

type DbExecutor = typeof db;

const LEAD_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isUniqueViolation(error: unknown) {
    return Boolean(
        error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: string }).code === "23505"
    );
}

export function buildLeadCode(seed: string, attempt = 0) {
    const digest = createHash("sha256")
        .update(`${seed}:${attempt}`)
        .digest();

    return Array.from(
        { length: 6 },
        (_, index) => LEAD_CODE_ALPHABET[digest[index] % LEAD_CODE_ALPHABET.length]
    ).join("");
}

export async function ensureLeadCode(
    leadId: string,
    executor: DbExecutor = db
) {
    const [row] = await executor
        .select({
            id: lead.id,
            leadCode: lead.leadCode,
            clientId: lead.clientId,
        })
        .from(lead)
        .where(eq(lead.id, leadId))
        .limit(1);

    if (!row) {
        throw new Error("LEAD_NOT_FOUND");
    }

    if (row.leadCode) {
        return row.leadCode;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = buildLeadCode(`${row.clientId || "global"}:${leadId}`, attempt);
        try {
            const [updated] = await executor
                .update(lead)
                .set({
                    leadCode: code,
                    updatedAt: new Date(),
                })
                .where(eq(lead.id, leadId))
                .returning({ leadCode: lead.leadCode });

            return updated?.leadCode || code;
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }
        }
    }

    throw new Error("LEAD_CODE_GENERATION_FAILED");
}

export function renderLeadMessageTemplate(
    template: string,
    params: {
        leadCode?: string | null;
        leadName?: string | null;
    }
) {
    const leadCode = params.leadCode || "-";
    const leadName = params.leadName || "-";
    const rendered = String(template || "")
        .replace(/\{\{\s*leadCode\s*\}\}/gi, leadCode)
        .replace(/\{\{\s*leadName\s*\}\}/gi, leadName);

    if (/\{\{\s*leadCode\s*\}\}/i.test(String(template || ""))) {
        return rendered;
    }

    return [`Kode Lead: ${leadCode}`, rendered].filter(Boolean).join("\n\n");
}
