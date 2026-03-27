import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index";
import { activity, customerPipelineFollowUp, user } from "../db/schema";
import { generateId } from "../utils/id";
import { CUSTOMER_PIPELINE_STEP_COUNT, getCustomerPipelineStepLabel } from "../utils/lead-workflow";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type PipelineStepRow = {
    id: string;
    leadId: string;
    stepNo: number;
    note: string | null;
    isChecked: boolean;
    checkedAt: Date | null;
    checkedBy: string | null;
    checkedByName?: string | null;
    isLocked: boolean;
    createdAt: Date;
    updatedAt: Date;
};

function sanitizeNote(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizePipelineRows(rows: PipelineStepRow[]) {
    const map = new Map(rows.map((row) => [row.stepNo, row]));

    return Array.from({ length: CUSTOMER_PIPELINE_STEP_COUNT }, (_, index) => {
        const stepNo = index + 1;
        const existing = map.get(stepNo);
        return existing || {
            id: `virtual-${stepNo}`,
            leadId: rows[0]?.leadId || "",
            stepNo,
            note: null,
            isChecked: false,
            checkedAt: null,
            checkedBy: null,
            checkedByName: null,
            isLocked: false,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        };
    });
}

export async function ensureCustomerPipelineRows(leadId: string, executor: DbExecutor = db) {
    const existingRows = await executor
        .select({
            id: customerPipelineFollowUp.id,
            stepNo: customerPipelineFollowUp.stepNo,
        })
        .from(customerPipelineFollowUp)
        .where(eq(customerPipelineFollowUp.leadId, leadId));

    const existingStepNos = new Set(existingRows.map((row) => row.stepNo));
    const now = new Date();

    for (let stepNo = 1; stepNo <= CUSTOMER_PIPELINE_STEP_COUNT; stepNo += 1) {
        if (existingStepNos.has(stepNo)) {
            continue;
        }

        await executor.insert(customerPipelineFollowUp).values({
            id: generateId(),
            leadId,
            stepNo,
            note: null,
            isChecked: false,
            checkedAt: null,
            checkedBy: null,
            isLocked: false,
            createdAt: now,
            updatedAt: now,
        });
    }
}

export async function listCustomerPipelineSteps(leadId: string) {
    const rows = await db
        .select({
            id: customerPipelineFollowUp.id,
            leadId: customerPipelineFollowUp.leadId,
            stepNo: customerPipelineFollowUp.stepNo,
            note: customerPipelineFollowUp.note,
            isChecked: customerPipelineFollowUp.isChecked,
            checkedAt: customerPipelineFollowUp.checkedAt,
            checkedBy: customerPipelineFollowUp.checkedBy,
            checkedByName: user.name,
            isLocked: customerPipelineFollowUp.isLocked,
            createdAt: customerPipelineFollowUp.createdAt,
            updatedAt: customerPipelineFollowUp.updatedAt,
        })
        .from(customerPipelineFollowUp)
        .leftJoin(user, eq(customerPipelineFollowUp.checkedBy, user.id))
        .where(eq(customerPipelineFollowUp.leadId, leadId))
        .orderBy(asc(customerPipelineFollowUp.stepNo));

    return normalizePipelineRows(rows);
}

export async function completeCustomerPipelineStep(params: {
    leadId: string;
    stepNo: number;
    note?: string | null;
    actorId: string;
    actorName: string;
}) {
    if (!Number.isInteger(params.stepNo) || params.stepNo < 1 || params.stepNo > CUSTOMER_PIPELINE_STEP_COUNT) {
        throw new Error("CUSTOMER_PIPELINE_STEP_INVALID");
    }

    await ensureCustomerPipelineRows(params.leadId);

    const [target] = await db
        .select()
        .from(customerPipelineFollowUp)
        .where(
            and(
                eq(customerPipelineFollowUp.leadId, params.leadId),
                eq(customerPipelineFollowUp.stepNo, params.stepNo)
            )
        )
        .limit(1);

    if (!target) {
        throw new Error("CUSTOMER_PIPELINE_STEP_INVALID");
    }

    if (target.isLocked) {
        throw new Error("CUSTOMER_PIPELINE_FOLLOW_UP_LOCKED");
    }

    const now = new Date();
    const nextNote = sanitizeNote(params.note);

    if (!nextNote) {
        throw new Error("CUSTOMER_PIPELINE_NOTE_REQUIRED");
    }

    const [updated] = await db
        .update(customerPipelineFollowUp)
        .set({
            note: nextNote,
            isChecked: true,
            checkedAt: now,
            checkedBy: params.actorId,
            isLocked: true,
            updatedAt: now,
        })
        .where(eq(customerPipelineFollowUp.id, target.id))
        .returning();

    await db.insert(activity).values({
        id: generateId(),
        leadId: params.leadId,
        type: "customer_pipeline",
        note: nextNote
            ? `${getCustomerPipelineStepLabel(params.stepNo)} diselesaikan oleh ${params.actorName} dengan catatan: ${nextNote}`
            : `${getCustomerPipelineStepLabel(params.stepNo)} diselesaikan oleh ${params.actorName}`,
        timestamp: now,
    });

    const rows = await listCustomerPipelineSteps(params.leadId);
    return rows.find((row) => row.stepNo === params.stepNo) || updated;
}

export async function getCustomerPipelineCompletionCount(leadId: string) {
    const rows = await db
        .select({
            isChecked: customerPipelineFollowUp.isChecked,
        })
        .from(customerPipelineFollowUp)
        .where(eq(customerPipelineFollowUp.leadId, leadId));

    return rows.filter((row) => row.isChecked).length;
}
