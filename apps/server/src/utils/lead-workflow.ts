const FLOW_STATUS_LABELS: Record<string, string> = {
    open: "Open",
    hold: "Hold",
    assigned: "Assigned",
    accepted: "Accepted",
};

const SALES_STATUS_LABELS: Record<string, string> = {
    warm: "Warm",
    hot: "Hot",
    error: "Error",
    cold: "Cold",
    no_response: "No Response",
    skip: "Skip",
};

const RESULT_STATUS_LABELS: Record<string, string> = {
    reserve: "Reserve",
    on_process: "On Process",
    full_book: "Full Book",
    akad: "Akad",
    cancel: "Cancel",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
    mau_survey: "Mau Survey",
    sudah_survey: "Sudah Survey",
    dibatalkan: "Dibatalkan",
};

export const FLOW_STATUS_SET = new Set(Object.keys(FLOW_STATUS_LABELS));
export const SALES_STATUS_SET = new Set(Object.keys(SALES_STATUS_LABELS));
export const RESULT_STATUS_SET = new Set(Object.keys(RESULT_STATUS_LABELS));
export const APPOINTMENT_STATUS_SET = new Set(Object.keys(APPOINTMENT_STATUS_LABELS));
export const CUSTOMER_PIPELINE_RULE_CODE = "customer_pipeline_overdue";
export const CUSTOMER_PIPELINE_STEP_COUNT = 5;
export const LEAD_COLD_OPEN_DAYS = 14;
export const CUSTOMER_PIPELINE_OVERDUE_DAYS = 14;
export const DAILY_TASK_FOLLOWUP_MILESTONE_DAYS = [4, 8, 12] as const;
export const DAILY_TASK_FOLLOWUP_STAGE_COUNT = DAILY_TASK_FOLLOWUP_MILESTONE_DAYS.length;
export const DAILY_TASK_TYPE_SET = new Set(["new_lead", "follow_up"]);
export const DAILY_TASK_STATUS_SET = new Set(["pending", "done", "invalid", "overdue"]);
export const DAILY_TASK_PENALTY_RULE_CODE = "daily_task_overdue";
export const DAILY_TASK_PENALTY_STATUS_SET = new Set([
    "active",
    "expired",
    "compensated",
    "invalid",
]);
export const DAILY_TASK_SP_LEVEL_SET = new Set(["none", "sp1", "sp2", "sp3"]);
export const PENALTY_DURATION_HOURS: Record<number, number> = {
    1: 24,
    2: 48,
};
export const PENALTY_DURATION_HOURS_DEFAULT = 96;

export function normalizeFlowStatus(
    flowStatus: string | null | undefined,
    assignedTo: string | null | undefined
) {
    const normalized = String(flowStatus || "").trim().toLowerCase();
    if (FLOW_STATUS_SET.has(normalized)) {
        return normalized;
    }
    return assignedTo ? "assigned" : "open";
}

export function normalizeSalesStatus(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return SALES_STATUS_SET.has(normalized) ? normalized : null;
}

export function normalizeResultStatus(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return RESULT_STATUS_SET.has(normalized) ? normalized : null;
}

export function getFlowStatusLabel(value: string | null | undefined) {
    return FLOW_STATUS_LABELS[String(value || "").trim().toLowerCase()] || value || "-";
}

export function getSalesStatusLabel(value: string | null | undefined) {
    return SALES_STATUS_LABELS[String(value || "").trim().toLowerCase()] || value || "-";
}

export function getResultStatusLabel(value: string | null | undefined) {
    return RESULT_STATUS_LABELS[String(value || "").trim().toLowerCase()] || value || "-";
}

export function getAppointmentStatusLabel(value: string | null | undefined) {
    return APPOINTMENT_STATUS_LABELS[String(value || "").trim().toLowerCase()] || value || "-";
}

export function isOlderThanDays(
    value: Date | string | null | undefined,
    days: number,
    nowInput?: Date
) {
    if (!value) {
        return false;
    }

    const sourceDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(sourceDate.getTime())) {
        return false;
    }

    const now = nowInput instanceof Date ? nowInput : new Date();
    const diffMs = now.getTime() - sourceDate.getTime();
    return diffMs > days * 24 * 60 * 60 * 1000;
}

export function canSelectColdOrNoResponse(createdAt: Date | string | null | undefined, now?: Date) {
    return isOlderThanDays(createdAt, LEAD_COLD_OPEN_DAYS, now);
}

export function getAllowedManualSalesStatuses(createdAt: Date | string | null | undefined, now?: Date) {
    if (canSelectColdOrNoResponse(createdAt, now)) {
        return ["hot", "error", "skip", "cold", "no_response"];
    }
    return ["hot", "error", "skip"];
}

export function canManuallySetSalesStatus(
    nextStatus: string | null | undefined,
    createdAt: Date | string | null | undefined,
    now?: Date
) {
    const normalized = normalizeSalesStatus(nextStatus);
    if (!normalized) {
        return true;
    }

    return getAllowedManualSalesStatuses(createdAt, now).includes(normalized);
}

export function getCustomerPipelineStepLabel(stepNo: number) {
    return `Follow Up ${stepNo}`;
}

export function normalizeDailyTaskType(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return DAILY_TASK_TYPE_SET.has(normalized) ? normalized : null;
}

export function normalizeDailyTaskStatus(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return DAILY_TASK_STATUS_SET.has(normalized) ? normalized : null;
}

export function normalizePenaltyStatus(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return DAILY_TASK_PENALTY_STATUS_SET.has(normalized) ? normalized : null;
}

export function normalizePenaltySpLevel(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return DAILY_TASK_SP_LEVEL_SET.has(normalized) ? normalized : "none";
}

export function getAllowedNewLeadTaskSalesStatuses(
    createdAt: Date | string | null | undefined,
    now?: Date
) {
    const allowed = ["warm", "hot", "error", "skip"];
    if (canSelectColdOrNoResponse(createdAt, now)) {
        allowed.push("cold", "no_response");
    }
    return allowed;
}

export function canSubmitNewLeadTaskSalesStatus(
    nextStatus: string | null | undefined,
    createdAt: Date | string | null | undefined,
    now?: Date
) {
    const normalized = normalizeSalesStatus(nextStatus);
    if (!normalized) {
        return false;
    }

    return getAllowedNewLeadTaskSalesStatuses(createdAt, now).includes(normalized);
}

export function getPenaltySPLevel(sequence: number): "none" | "sp1" | "sp2" | "sp3" {
    const normalizedSequence = Math.max(1, Number(sequence || 0));
    if (normalizedSequence >= 5) {
        return "sp3";
    }
    if (normalizedSequence === 4) {
        return "sp2";
    }
    if (normalizedSequence === 3) {
        return "sp1";
    }
    return "none";
}

export function getPenaltyDurationHours(sequence: number) {
    const normalizedSequence = Math.max(1, Number(sequence || 0));
    return PENALTY_DURATION_HOURS[normalizedSequence] ?? PENALTY_DURATION_HOURS_DEFAULT;
}

export function getPenaltyDurationLabel(hours: number) {
    const normalizedHours = Math.max(1, Number(hours || 0));
    if (normalizedHours % 24 === 0) {
        const days = normalizedHours / 24;
        return `${days} hari`;
    }
    return `${normalizedHours} jam`;
}

export function isCustomerPipelinePenaltyDue(params: {
    acceptedAt?: Date | string | null;
    salesStatus?: string | null;
    checkedCount: number;
    now?: Date;
}) {
    if (normalizeSalesStatus(params.salesStatus) !== "warm") {
        return false;
    }

    if (params.checkedCount >= CUSTOMER_PIPELINE_STEP_COUNT) {
        return false;
    }

    return isOlderThanDays(params.acceptedAt, CUSTOMER_PIPELINE_OVERDUE_DAYS, params.now);
}

export function resolveCustomerPipelinePenaltyLayer(previousPenaltyCount: number) {
    const nextCount = Math.max(0, Number(previousPenaltyCount || 0)) + 1;
    if (nextCount >= 3) {
        return 3;
    }
    return nextCount;
}

export function getCustomerPipelineSuspensionDays(penaltyLayer: number) {
    if (penaltyLayer <= 1) {
        return 1;
    }

    if (penaltyLayer === 2) {
        return 3;
    }

    return 7;
}
