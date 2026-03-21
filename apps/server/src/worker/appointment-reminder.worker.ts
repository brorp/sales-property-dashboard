import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { appointment, lead, user, waMessage } from "../db/schema";
import { getActiveWhatsAppNumber } from "../services/whatsapp-identity.service";
import { sendWhatsAppText } from "../services/whatsapp-provider.service";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";

const POLL_INTERVAL_MS = Number(process.env.APPOINTMENT_REMINDER_POLL_MS || 60_000);
const REMINDER_TIMEZONE = process.env.APPOINTMENT_REMINDER_TIMEZONE || "Asia/Jakarta";
const REMINDER_HOUR = Number(process.env.APPOINTMENT_REMINDER_HOUR || 9);

let timer: NodeJS.Timeout | null = null;
let lastRunDateKey: string | null = null;

function getZonedParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const map = new Map(parts.map((part) => [part.type, part.value]));

    return {
        year: map.get("year") || "0000",
        month: map.get("month") || "01",
        day: map.get("day") || "01",
        hour: Number(map.get("hour") || 0),
        minute: Number(map.get("minute") || 0),
    };
}

function toDateKey(parts: { year: string; month: string; day: string }) {
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTomorrowDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const next = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
    next.setUTCDate(next.getUTCDate() + 1);

    const nextYear = next.getUTCFullYear();
    const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(next.getUTCDate()).padStart(2, "0");
    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function buildReminderMessage(params: {
    salesName: string;
    targetDate: string;
    items: Array<{
        time: string;
        leadName: string;
        leadPhone: string;
        location: string;
    }>;
}) {
    const lines = params.items
        .sort((a, b) => String(a.time).localeCompare(String(b.time)))
        .map((item, index) => {
            const location = item.location?.trim() || "Lokasi belum diisi";
            return `${index + 1}. ${item.time} - ${item.leadName} (${item.leadPhone}) @ ${location}`;
        });

    return [
        `[Appointment Reminder ${params.targetDate}]`,
        `Halo ${params.salesName}, berikut reminder appointment besok:`,
        ...lines,
        "",
        "Tolong follow up sesuai jadwal dan update status appointment setelah ada perubahan.",
    ].join("\n");
}

async function sendDailyAppointmentReminders(targetDate: string) {
    const appointmentRows = await db
        .select({
            id: appointment.id,
            leadId: appointment.leadId,
            salesId: appointment.salesId,
            assignedTo: lead.assignedTo,
            date: appointment.date,
            time: appointment.time,
            location: appointment.location,
            leadName: lead.name,
            leadPhone: lead.phone,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .where(
            and(
                eq(appointment.status, "mau_survey"),
                eq(appointment.date, targetDate)
            )
        )
        .orderBy(desc(appointment.time));

    if (appointmentRows.length === 0) {
        return 0;
    }

    const salesIds = Array.from(
        new Set(
            appointmentRows
                .map((item) => item.salesId || item.assignedTo || null)
                .filter((value): value is string => Boolean(value))
        )
    );

    if (salesIds.length === 0) {
        return 0;
    }

    const salesRows = await db
        .select({
            id: user.id,
            name: user.name,
            phone: user.phone,
            isActive: user.isActive,
        })
        .from(user)
        .where(
            and(
                inArray(user.id, salesIds),
                eq(user.role, "sales"),
                eq(user.isActive, true)
            )
        );

    const salesMap = new Map(salesRows.map((item) => [item.id, item]));
    let sentCount = 0;

    for (const salesId of salesIds) {
        const sales = salesMap.get(salesId);
        if (!sales?.phone) {
            continue;
        }

        const ownAppointments = appointmentRows.filter(
            (item) => (item.salesId || item.assignedTo || null) === salesId
        );

        if (ownAppointments.length === 0) {
            continue;
        }

        const message = buildReminderMessage({
            salesName: sales.name,
            targetDate,
            items: ownAppointments.map((item) => ({
                time: item.time,
                leadName: item.leadName,
                leadPhone: item.leadPhone,
                location: item.location,
            })),
        });

        const sendResult = await sendWhatsAppText(sales.phone, message);
        await db.insert(waMessage).values({
            id: generateId(),
            providerMessageId: sendResult.providerMessageId || null,
            fromWa: getActiveWhatsAppNumber(),
            toWa: sales.phone,
            body: sendResult.sent
                ? message
                : `${message}\n\n[send_error] ${sendResult.error || "unknown"}`,
            direction: "outbound_to_sales",
            salesId,
            leadId: null,
            createdAt: new Date(),
        });

        if (sendResult.sent) {
            sentCount += 1;
        }
    }

    return sentCount;
}

async function tick() {
    const now = new Date();
    const parts = getZonedParts(now, REMINDER_TIMEZONE);
    const todayKey = toDateKey(parts);

    if (parts.hour !== REMINDER_HOUR || lastRunDateKey === todayKey) {
        return;
    }

    const tomorrowKey = getTomorrowDateKey(todayKey);

    try {
        const sentCount = await sendDailyAppointmentReminders(tomorrowKey);
        lastRunDateKey = todayKey;
        logger.info("[appointment-reminder-worker] completed", {
            todayKey,
            tomorrowKey,
            sentCount,
            timeZone: REMINDER_TIMEZONE,
        });
    } catch (error) {
        logger.error("[appointment-reminder-worker] failed", {
            error,
            todayKey,
            tomorrowKey,
        });
    }
}

export function startAppointmentReminderWorker() {
    if (timer) {
        return;
    }

    timer = setInterval(() => {
        void tick();
    }, POLL_INTERVAL_MS);

    logger.info("[appointment-reminder-worker] started", {
        pollMs: POLL_INTERVAL_MS,
        timeZone: REMINDER_TIMEZONE,
        hour: REMINDER_HOUR,
    });

    void tick();
}

export function stopAppointmentReminderWorker() {
    if (!timer) {
        return;
    }

    clearInterval(timer);
    timer = null;
}
