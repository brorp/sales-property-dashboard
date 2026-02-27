import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSetting } from "../db/schema";

const SETTINGS_ID = "global";
const ALLOWED_ACK_TIMEOUT_MINUTES = new Set([5, 10, 15]);

const DEFAULT_SETTINGS = {
    distributionAckTimeoutMinutes: 5,
    operationalStartMinute: 9 * 60,
    operationalEndMinute: 21 * 60,
    operationalTimezone: "Asia/Jakarta",
    outsideOfficeReply:
        "Terima kasih sudah menghubungi kami. Jam operasional kami 09.00 - 21.00 WIB. Tim kami akan merespons saat jam operasional.",
};

function toTwoDigits(value: number) {
    return String(value).padStart(2, "0");
}

function minutesToHHMM(value: number) {
    const safeValue = Math.max(0, Math.min(24 * 60 - 1, value));
    const hour = Math.floor(safeValue / 60);
    const minute = safeValue % 60;
    return `${toTwoDigits(hour)}:${toTwoDigits(minute)}`;
}

function hhmmToMinutes(value: string) {
    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }
    return hour * 60 + minute;
}

function formatOperationalRange(startMinute: number, endMinute: number) {
    const start = minutesToHHMM(startMinute).replace(":", ".");
    const end = minutesToHHMM(endMinute).replace(":", ".");
    return `${start} - ${end}`;
}

function getMinutesInTimezone(at: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        hourCycle: "h23",
    }).formatToParts(at);

    const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
    return hour * 60 + minute;
}

function isWithinOperationalHours(params: {
    nowMinute: number;
    startMinute: number;
    endMinute: number;
}) {
    const { nowMinute, startMinute, endMinute } = params;
    if (startMinute < endMinute) {
        return nowMinute >= startMinute && nowMinute <= endMinute;
    }
    return nowMinute >= startMinute || nowMinute <= endMinute;
}

function mapSettingsRow(row: {
    distributionAckTimeoutMinutes: number;
    operationalStartMinute: number;
    operationalEndMinute: number;
    operationalTimezone: string;
    outsideOfficeReply: string;
    updatedAt: Date;
}) {
    return {
        distributionAckTimeoutMinutes: row.distributionAckTimeoutMinutes,
        operationalStart: minutesToHHMM(row.operationalStartMinute),
        operationalEnd: minutesToHHMM(row.operationalEndMinute),
        operationalTimezone: row.operationalTimezone,
        operationalRangeLabel: formatOperationalRange(
            row.operationalStartMinute,
            row.operationalEndMinute
        ),
        outsideOfficeReply: row.outsideOfficeReply,
        updatedAt: row.updatedAt.toISOString(),
    };
}

async function ensureSettingsRow() {
    const [existing] = await db
        .select()
        .from(appSetting)
        .where(eq(appSetting.id, SETTINGS_ID))
        .limit(1);

    if (existing) {
        return existing;
    }

    const now = new Date();
    const [created] = await db
        .insert(appSetting)
        .values({
            id: SETTINGS_ID,
            distributionAckTimeoutMinutes:
                DEFAULT_SETTINGS.distributionAckTimeoutMinutes,
            operationalStartMinute: DEFAULT_SETTINGS.operationalStartMinute,
            operationalEndMinute: DEFAULT_SETTINGS.operationalEndMinute,
            operationalTimezone: DEFAULT_SETTINGS.operationalTimezone,
            outsideOfficeReply: DEFAULT_SETTINGS.outsideOfficeReply,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    return created;
}

export async function getSystemSettings() {
    const settings = await ensureSettingsRow();
    return mapSettingsRow(settings);
}

export async function updateSystemSettings(input: {
    distributionAckTimeoutMinutes?: number;
    operationalStart?: string;
    operationalEnd?: string;
    operationalTimezone?: string;
    outsideOfficeReply?: string;
}) {
    const current = await ensureSettingsRow();
    const updates: Record<string, unknown> = {
        updatedAt: new Date(),
    };

    if (input.distributionAckTimeoutMinutes !== undefined) {
        if (!ALLOWED_ACK_TIMEOUT_MINUTES.has(input.distributionAckTimeoutMinutes)) {
            throw new Error("INVALID_DISTRIBUTION_ACK_TIMEOUT");
        }
        updates.distributionAckTimeoutMinutes = input.distributionAckTimeoutMinutes;
    }

    const nextTimezoneRaw =
        typeof input.operationalTimezone === "string"
            ? input.operationalTimezone.trim()
            : current.operationalTimezone;

    const nextTimezone =
        nextTimezoneRaw.length > 0 ? nextTimezoneRaw : current.operationalTimezone;

    try {
        new Intl.DateTimeFormat("en-US", { timeZone: nextTimezone }).format(new Date());
    } catch {
        throw new Error("INVALID_OPERATIONAL_TIMEZONE");
    }

    const nextStartMinute =
        typeof input.operationalStart === "string"
            ? hhmmToMinutes(input.operationalStart)
            : current.operationalStartMinute;
    const nextEndMinute =
        typeof input.operationalEnd === "string"
            ? hhmmToMinutes(input.operationalEnd)
            : current.operationalEndMinute;

    if (
        (input.operationalStart !== undefined && nextStartMinute === null) ||
        (input.operationalEnd !== undefined && nextEndMinute === null)
    ) {
        throw new Error("INVALID_OPERATIONAL_TIME");
    }

    if (nextStartMinute === nextEndMinute) {
        throw new Error("INVALID_OPERATIONAL_TIME_RANGE");
    }

    if (input.operationalStart !== undefined) {
        updates.operationalStartMinute = nextStartMinute;
    }
    if (input.operationalEnd !== undefined) {
        updates.operationalEndMinute = nextEndMinute;
    }
    if (input.operationalTimezone !== undefined) {
        updates.operationalTimezone = nextTimezone;
    }

    if (input.outsideOfficeReply !== undefined) {
        const nextReply = String(input.outsideOfficeReply).trim();
        if (!nextReply) {
            throw new Error("OUTSIDE_OFFICE_REPLY_REQUIRED");
        }
        updates.outsideOfficeReply = nextReply;
    }

    const [updated] = await db
        .update(appSetting)
        .set(updates)
        .where(eq(appSetting.id, SETTINGS_ID))
        .returning();

    return mapSettingsRow(updated || current);
}

export async function getDistributionAckTimeoutMs() {
    const settings = await ensureSettingsRow();
    return settings.distributionAckTimeoutMinutes * 60 * 1000;
}

export async function getOperationalWindowState(at = new Date()) {
    const settings = await ensureSettingsRow();
    const nowMinute = getMinutesInTimezone(at, settings.operationalTimezone);
    const isOpen = isWithinOperationalHours({
        nowMinute,
        startMinute: settings.operationalStartMinute,
        endMinute: settings.operationalEndMinute,
    });

    return {
        isOpen,
        nowMinute,
        distributionAckTimeoutMinutes: settings.distributionAckTimeoutMinutes,
        operationalStart: minutesToHHMM(settings.operationalStartMinute),
        operationalEnd: minutesToHHMM(settings.operationalEndMinute),
        operationalRangeLabel: formatOperationalRange(
            settings.operationalStartMinute,
            settings.operationalEndMinute
        ),
        operationalTimezone: settings.operationalTimezone,
        outsideOfficeReply: settings.outsideOfficeReply,
    };
}
