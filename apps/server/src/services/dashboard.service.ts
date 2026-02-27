import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appointment, lead, user } from "../db/schema";
import { resolveAppointmentTag, toAppointmentDateTime } from "../utils/appointment";

type LeadRow = {
    id: string;
    name: string;
    phone: string;
    source: string;
    assignedTo: string | null;
    assignedUserName: string | null;
    flowStatus: string;
    salesStatus: string | null;
    domicileCity: string | null;
    resultStatus: string | null;
    rejectedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
};

type AppointmentRow = {
    id: string;
    leadId: string;
    date: string;
    time: string;
    location: string;
    notes: string | null;
    salesId: string | null;
    salesName: string | null;
    createdAt: Date;
    leadName: string;
    leadPhone: string;
    assignedTo: string | null;
};

const SALES_STATUS_META = [
    { key: "hot", label: "Hot" },
    { key: "warm", label: "Warm" },
    { key: "cold", label: "Cold" },
    { key: "error", label: "Error" },
    { key: "no_response", label: "No Response" },
    { key: "skip", label: "Skip" },
] as const;

const RESULT_STATUS_META = [
    { key: "closing", label: "Closing" },
    { key: "menunggu", label: "Menunggu" },
    { key: "batal", label: "Batal" },
] as const;

function normalizeFlowStatus(
    flowStatus: string | null | undefined,
    assignedTo: string | null | undefined
) {
    if (flowStatus === "hold") {
        return "hold";
    }
    if (flowStatus === "assigned") {
        return "assigned";
    }
    if (assignedTo) {
        return "assigned";
    }
    return "open";
}

function toPercent(count: number, total: number) {
    if (total <= 0) {
        return 0;
    }
    return Math.round((count / total) * 10000) / 100;
}

function getLatestAppointmentByLead(appointments: AppointmentRow[]) {
    const latestMap = new Map<string, AppointmentRow>();

    for (const item of appointments) {
        const prev = latestMap.get(item.leadId);
        if (!prev) {
            latestMap.set(item.leadId, item);
            continue;
        }

        const prevAt = toAppointmentDateTime(prev.date, prev.time).getTime();
        const nextAt = toAppointmentDateTime(item.date, item.time).getTime();
        if (nextAt > prevAt) {
            latestMap.set(item.leadId, item);
        }
    }

    return latestMap;
}

async function loadScopedLeadsAndAppointments(userId: string, role: string) {
    const leadCondition = role === "admin" ? undefined : eq(lead.assignedTo, userId);

    const scopedLeads = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            assignedTo: lead.assignedTo,
            assignedUserName: user.name,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            domicileCity: lead.domicileCity,
            resultStatus: lead.resultStatus,
            rejectedReason: lead.rejectedReason,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(leadCondition);

    if (scopedLeads.length === 0) {
        return {
            leads: [] as LeadRow[],
            appointments: [] as AppointmentRow[],
        };
    }

    const leadIds = scopedLeads.map((item) => item.id);

    const scopedAppointments = await db
        .select({
            id: appointment.id,
            leadId: appointment.leadId,
            date: appointment.date,
            time: appointment.time,
            location: appointment.location,
            notes: appointment.notes,
            salesId: appointment.salesId,
            salesName: user.name,
            createdAt: appointment.createdAt,
            leadName: lead.name,
            leadPhone: lead.phone,
            assignedTo: lead.assignedTo,
        })
        .from(appointment)
        .innerJoin(lead, eq(appointment.leadId, lead.id))
        .leftJoin(user, eq(appointment.salesId, user.id))
        .where(inArray(appointment.leadId, leadIds))
        .orderBy(asc(appointment.date), asc(appointment.time));

    return {
        leads: scopedLeads,
        appointments: scopedAppointments,
    };
}

export async function getHomeAnalytics(userId: string, role: string) {
    const { leads: scopedLeads, appointments: scopedAppointments } =
        await loadScopedLeadsAndAppointments(userId, role);

    const latestAppointmentByLead = getLatestAppointmentByLead(scopedAppointments);

    const decoratedLeads = scopedLeads.map((item) => {
        const latestAppointment = latestAppointmentByLead.get(item.id) || null;
        return {
            ...item,
            flowStatus: normalizeFlowStatus(item.flowStatus, item.assignedTo),
            appointmentTag: resolveAppointmentTag(latestAppointment),
            latestAppointment,
        };
    });

    const totalLeads = decoratedLeads.length;
    const surveyedLeads = decoratedLeads.filter(
        (item) => item.appointmentTag === "sudah_survey"
    ).length;

    const flowOverview = {
        open: decoratedLeads.filter((item) => item.flowStatus === "open").length,
        assigned: decoratedLeads.filter((item) => item.flowStatus === "assigned").length,
    };

    const surveyRatio = {
        totalLeads,
        surveyedLeads,
        ratioPercent: toPercent(surveyedLeads, totalLeads),
    };

    const statusCounts = new Map<string, number>();
    for (const item of decoratedLeads) {
        const key = item.salesStatus || "unfilled";
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    }

    const statusPieItems = [
        ...SALES_STATUS_META.map((status) => ({
            key: status.key,
            label: status.label,
            count: statusCounts.get(status.key) || 0,
        })),
        {
            key: "unfilled",
            label: "Belum Diisi",
            count: statusCounts.get("unfilled") || 0,
        },
    ].map((item) => ({
        ...item,
        percentage: toPercent(item.count, totalLeads),
    }));

    const domicileMap = new Map<string, number>();
    for (const item of decoratedLeads) {
        const city = item.domicileCity;
        if (!city) {
            continue;
        }
        domicileMap.set(city, (domicileMap.get(city) || 0) + 1);
    }

    const domicileBars = Array.from(domicileMap.entries())
        .map(([city, count]) => ({
            city,
            count,
            percentage: toPercent(count, totalLeads),
        }))
        .sort((a, b) => b.count - a.count);

    const ongoingAppointments = scopedAppointments
        .map((item) => ({
            ...item,
            appointmentTag: resolveAppointmentTag(item),
            appointmentAt: toAppointmentDateTime(item.date, item.time),
        }))
        .filter((item) => item.appointmentTag === "mau_survey")
        .sort((a, b) => a.appointmentAt.getTime() - b.appointmentAt.getTime())
        .map(({ appointmentAt, ...item }) => item)
        .slice(0, 20);

    const resultCounts = new Map<string, number>();
    for (const item of decoratedLeads) {
        const key = item.resultStatus || "none";
        resultCounts.set(key, (resultCounts.get(key) || 0) + 1);
    }

    const resultRecapItems = RESULT_STATUS_META.map((status) => {
        const count = resultCounts.get(status.key) || 0;
        return {
            key: status.key,
            label: status.label,
            count,
            percentage: toPercent(count, totalLeads),
        };
    });

    const cancelledLeads = decoratedLeads.filter(
        (item) => item.resultStatus === "batal" && item.rejectedReason
    );
    const cancelReasonMap = new Map<string, number>();
    for (const item of cancelledLeads) {
        const reason = item.rejectedReason || "lainnya";
        cancelReasonMap.set(reason, (cancelReasonMap.get(reason) || 0) + 1);
    }

    const cancelReasonItems = Array.from(cancelReasonMap.entries())
        .map(([key, count]) => ({
            key,
            count,
            percentage: toPercent(count, cancelledLeads.length),
        }))
        .sort((a, b) => b.count - a.count);

    let perAgentSurveyRatio: Array<{
        salesId: string;
        salesName: string;
        totalLeads: number;
        surveyedLeads: number;
        ratioPercent: number;
    }> = [];

    if (role === "admin") {
        const salesUsers = await db
            .select({
                id: user.id,
                name: user.name,
            })
            .from(user)
            .where(eq(user.role, "sales"))
            .orderBy(asc(user.name));

        perAgentSurveyRatio = salesUsers.map((sales) => {
            const ownLeads = decoratedLeads.filter((item) => item.assignedTo === sales.id);
            const ownSurveyed = ownLeads.filter(
                (item) => item.appointmentTag === "sudah_survey"
            ).length;
            return {
                salesId: sales.id,
                salesName: sales.name,
                totalLeads: ownLeads.length,
                surveyedLeads: ownSurveyed,
                ratioPercent: toPercent(ownSurveyed, ownLeads.length),
            };
        });
    }

    const holdLeads =
        role === "admin"
            ? decoratedLeads
                  .filter((item) => item.flowStatus === "hold")
                  .sort(
                      (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime()
                  )
                  .slice(0, 50)
                  .map((item) => ({
                      id: item.id,
                      name: item.name,
                      phone: item.phone,
                      source: item.source,
                      createdAt: item.createdAt,
                      receivedAt: item.createdAt,
                  }))
            : [];

    return {
        scope: role === "admin" ? "overall" : "agent",
        flowOverview,
        surveyRatio,
        perAgentSurveyRatio,
        statusPie: {
            total: totalLeads,
            items: statusPieItems,
        },
        domicileBars,
        ongoingAppointments,
        resultRecap: {
            total: totalLeads,
            items: resultRecapItems,
            cancelReasons: {
                total: cancelledLeads.length,
                items: cancelReasonItems,
            },
        },
        holdLeads,
    };
}
