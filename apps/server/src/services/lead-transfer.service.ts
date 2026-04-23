import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index";
import { activity, lead, leadReassignmentAudit, user } from "../db/schema";
import { generateId } from "../utils/id";
import { normalizePhone } from "../utils/phone";
import { syncLeadAppointmentsSalesOwner } from "./appointments.service";

type AdminActor = {
    actorId: string;
    actorRole: string;
    actorClientId?: string | null;
};

type ParsedImportRow = {
    rowNumber: number;
    leadId: string;
    phone: string;
    oldSalesId: string;
    oldSalesName: string;
};

type LeadRow = {
    id: string;
    name: string;
    phone: string;
    source: string;
    clientId: string | null;
    assignedTo: string | null;
    flowStatus: string;
    salesStatus: string | null;
    resultStatus: string | null;
    clientStatus: string | null;
    layer2Status: string | null;
    progress: string | null;
    domicileCity: string | null;
    interestProjectType: string | null;
    interestUnitName: string | null;
    rejectedReason: string | null;
    rejectedNote: string | null;
    entryChannel: string;
    metaLeadId: string | null;
    receivedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    currentSalesName: string | null;
    currentSalesEmail: string | null;
    currentSalesPhone: string | null;
};

type EvaluatedImportRow = {
    rowNumber: number;
    sourceLeadId: string;
    sourcePhone: string;
    matchedLeadId: string | null;
    matchedLeadName: string | null;
    currentSalesId: string | null;
    currentSalesName: string | null;
    matchedBy: "leadId" | "phone" | null;
    status: "ready" | "updated" | "skip" | "error";
    reason: string | null;
};

const EXPORT_COLUMNS = [
    "leadId",
    "name",
    "phone",
    "source",
    "entryChannel",
    "metaLeadId",
    "clientId",
    "currentSalesId",
    "currentSalesName",
    "currentSalesEmail",
    "currentSalesPhone",
    "flowStatus",
    "salesStatus",
    "resultStatus",
    "clientStatus",
    "layer2Status",
    "progress",
    "domicileCity",
    "interestProjectType",
    "interestUnitName",
    "rejectedReason",
    "rejectedNote",
    "receivedAt",
    "createdAt",
    "updatedAt",
] as const;

function getLeadExportAccessCode() {
    const value = String(process.env.LEADS_EXPORT_ACCESS_CODE || "").trim();
    return value || null;
}

function assertAdminActor(actor: AdminActor) {
    if (actor.actorRole !== "root_admin" && actor.actorRole !== "client_admin") {
        throw new Error("FORBIDDEN");
    }
}

export function assertLeadExportAccessCode(accessCode: unknown) {
    const configuredCode = getLeadExportAccessCode();
    if (!configuredCode) {
        throw new Error("LEADS_EXPORT_ACCESS_CODE_NOT_CONFIGURED");
    }

    const submittedCode = typeof accessCode === "string" ? accessCode.trim() : "";
    if (!submittedCode) {
        throw new Error("LEADS_EXPORT_ACCESS_CODE_REQUIRED");
    }

    if (submittedCode !== configuredCode) {
        throw new Error("LEADS_EXPORT_ACCESS_CODE_INVALID");
    }
}

function sanitizeText(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
}

function parseCsvText(csvText: string) {
    const source = String(csvText || "").replace(/^\uFEFF/, "");
    const rows: string[][] = [];
    let currentCell = "";
    let currentRow: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i];
        const nextChar = source[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (char === "," && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") {
                i += 1;
            }
            currentRow.push(currentCell);
            currentCell = "";
            const hasMeaningfulData = currentRow.some((item) => String(item || "").trim().length > 0);
            if (hasMeaningfulData) {
                rows.push(currentRow);
            }
            currentRow = [];
            continue;
        }

        currentCell += char;
    }

    currentRow.push(currentCell);
    if (currentRow.some((item) => String(item || "").trim().length > 0)) {
        rows.push(currentRow);
    }

    return rows;
}

function mapParsedRowsFromObjects(rawRows: unknown[]): ParsedImportRow[] {
    return rawRows.map((row, index) => {
        const item = row && typeof row === "object" ? row as Record<string, unknown> : {};

        return {
            rowNumber: index + 2,
            leadId: sanitizeText(item.leadId),
            phone: sanitizeText(item.phone),
            oldSalesId: sanitizeText(item.currentSalesId),
            oldSalesName: sanitizeText(item.currentSalesName),
        };
    });
}

function mapParsedRowsFromInput(input: { csvText?: string; rows?: unknown[] }) {
    if (Array.isArray(input.rows)) {
        return mapParsedRowsFromObjects(input.rows);
    }
    return mapParsedRows(input.csvText || "");
}

function mapParsedRows(csvText: string): ParsedImportRow[] {
    const rows = parseCsvText(csvText);
    if (rows.length === 0) {
        throw new Error("IMPORT_FILE_EMPTY");
    }

    const headers = rows[0].map((item) => String(item || "").trim());
    const headerMap = new Map(headers.map((item, index) => [item, index]));

    if (!headerMap.has("leadId") && !headerMap.has("phone")) {
        throw new Error("IMPORT_HEADER_INVALID");
    }

    return rows.slice(1).map((cells, index) => ({
        rowNumber: index + 2,
        leadId: sanitizeText(cells[headerMap.get("leadId") ?? -1]),
        phone: sanitizeText(cells[headerMap.get("phone") ?? -1]),
        oldSalesId: sanitizeText(cells[headerMap.get("currentSalesId") ?? -1]),
        oldSalesName: sanitizeText(cells[headerMap.get("currentSalesName") ?? -1]),
    }));
}

function toNormalizedPhone(value: string) {
    const trimmed = sanitizeText(value);
    if (!trimmed) {
        return "";
    }

    try {
        return normalizePhone(trimmed);
    } catch {
        return "";
    }
}

async function getManagedSalesRow(salesId: string, actor: AdminActor, requireActive = false) {
    const conditions = [eq(user.id, salesId), eq(user.role, "sales")];

    if (requireActive) {
        conditions.push(eq(user.isActive, true));
    }

    const [row] = await db
        .select({
            id: user.id,
            name: user.name,
            email: user.email,
            clientId: user.clientId,
            isActive: user.isActive,
        })
        .from(user)
        .where(and(...conditions))
        .limit(1);

    return row || null;
}

function mapLeadFlowStatus(flowStatus: string | null | undefined, assignedTo: string | null | undefined) {
    if (flowStatus === "hold") {
        return "hold";
    }
    if (flowStatus === "accepted") {
        return "accepted";
    }
    if (flowStatus === "assigned") {
        return "assigned";
    }
    return assignedTo ? "assigned" : "open";
}

export async function exportSalesLeadsWorkbookData(
    salesId: string,
    actor: AdminActor,
    accessCode?: string | null
) {
    assertAdminActor(actor);
    assertLeadExportAccessCode(accessCode);

    const salesRow = await getManagedSalesRow(salesId, actor, false);
    if (!salesRow) {
        throw new Error("SALES_NOT_FOUND");
    }

    const leadRows = await db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            entryChannel: lead.entryChannel,
            metaLeadId: lead.metaLeadId,
            clientId: lead.clientId,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
            clientStatus: lead.clientStatus,
            layer2Status: lead.layer2Status,
            progress: lead.progress,
            domicileCity: lead.domicileCity,
            interestProjectType: lead.interestProjectType,
            interestUnitName: lead.interestUnitName,
            rejectedReason: lead.rejectedReason,
            rejectedNote: lead.rejectedNote,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            receivedAt: lead.receivedAt,
            currentSalesName: user.name,
            currentSalesEmail: user.email,
            currentSalesPhone: user.phone,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(eq(lead.assignedTo, salesRow.id));

    return {
        fileName: `sales-${salesRow.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || salesRow.id}-leads.xlsx`,
        exportedCount: leadRows.length,
        sales: salesRow,
        columns: EXPORT_COLUMNS,
        rows: leadRows.map((row) => ({
            leadId: row.id,
            name: row.name,
            phone: row.phone,
            source: row.source,
            entryChannel: row.entryChannel,
            metaLeadId: row.metaLeadId || "",
            clientId: row.clientId || "",
            currentSalesId: row.assignedTo || "",
            currentSalesName: row.currentSalesName || salesRow.name,
            currentSalesEmail: row.currentSalesEmail || salesRow.email,
            currentSalesPhone: row.currentSalesPhone || "",
            flowStatus: mapLeadFlowStatus(row.flowStatus, row.assignedTo),
            salesStatus: row.salesStatus || "",
            resultStatus: row.resultStatus || "",
            clientStatus: row.clientStatus || "",
            layer2Status: row.layer2Status || "",
            progress: row.progress || "",
            domicileCity: row.domicileCity || "",
            interestProjectType: row.interestProjectType || "",
            interestUnitName: row.interestUnitName || "",
            rejectedReason: row.rejectedReason || "",
            rejectedNote: row.rejectedNote || "",
            receivedAt: row.receivedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        })),
    };
}

async function loadCandidateLeads(parsedRows: ParsedImportRow[], clientId: string) {
    const leadIds = Array.from(new Set(parsedRows.map((row) => row.leadId).filter(Boolean)));
    const normalizedPhones = Array.from(
        new Set(parsedRows.map((row) => toNormalizedPhone(row.phone)).filter(Boolean))
    );

    const leadConditions: Array<any> = [];
    if (leadIds.length > 0) {
        leadConditions.push(inArray(lead.id, leadIds));
    }
    if (normalizedPhones.length > 0) {
        leadConditions.push(inArray(lead.phone, normalizedPhones));
    }

    if (leadConditions.length === 0) {
        return [] as LeadRow[];
    }

    return db
        .select({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            source: lead.source,
            clientId: lead.clientId,
            assignedTo: lead.assignedTo,
            flowStatus: lead.flowStatus,
            salesStatus: lead.salesStatus,
            resultStatus: lead.resultStatus,
            clientStatus: lead.clientStatus,
            layer2Status: lead.layer2Status,
            progress: lead.progress,
            domicileCity: lead.domicileCity,
            interestProjectType: lead.interestProjectType,
            interestUnitName: lead.interestUnitName,
            rejectedReason: lead.rejectedReason,
            rejectedNote: lead.rejectedNote,
            entryChannel: lead.entryChannel,
            metaLeadId: lead.metaLeadId,
            receivedAt: lead.receivedAt,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            currentSalesName: user.name,
            currentSalesEmail: user.email,
            currentSalesPhone: user.phone,
        })
        .from(lead)
        .leftJoin(user, eq(lead.assignedTo, user.id))
        .where(and(eq(lead.clientId, clientId), or(...leadConditions)));
}

function evaluateImportRows(
    parsedRows: ParsedImportRow[],
    candidateLeads: LeadRow[],
    targetSalesId: string
) {
    const leadsById = new Map(candidateLeads.map((item) => [item.id, item]));
    const leadsByPhone = new Map<string, LeadRow[]>();

    candidateLeads.forEach((item) => {
        const key = toNormalizedPhone(item.phone);
        const current = leadsByPhone.get(key) || [];
        current.push(item);
        leadsByPhone.set(key, current);
    });

    const seenLeadIds = new Set<string>();

    return parsedRows.map((row) => {
        const fallbackPhone = toNormalizedPhone(row.phone);

        if (!row.leadId && !fallbackPhone) {
            return {
                rowNumber: row.rowNumber,
                sourceLeadId: row.leadId,
                sourcePhone: row.phone,
                matchedLeadId: null,
                matchedLeadName: null,
                currentSalesId: null,
                currentSalesName: null,
                matchedBy: null,
                status: "error",
                reason: "missing_identifier",
            } satisfies EvaluatedImportRow;
        }

        let matchedLead: LeadRow | null = row.leadId ? leadsById.get(row.leadId) || null : null;
        let matchedBy: EvaluatedImportRow["matchedBy"] = matchedLead ? "leadId" : null;

        if (!matchedLead && fallbackPhone) {
            const byPhone = leadsByPhone.get(fallbackPhone) || [];
            if (byPhone.length > 1) {
                return {
                    rowNumber: row.rowNumber,
                    sourceLeadId: row.leadId,
                    sourcePhone: row.phone,
                    matchedLeadId: null,
                    matchedLeadName: null,
                    currentSalesId: null,
                    currentSalesName: null,
                    matchedBy: null,
                    status: "error",
                    reason: "phone_ambiguous",
                } satisfies EvaluatedImportRow;
            }

            if (byPhone.length === 1) {
                matchedLead = byPhone[0];
                matchedBy = "phone";
            }
        }

        if (!matchedLead) {
            return {
                rowNumber: row.rowNumber,
                sourceLeadId: row.leadId,
                sourcePhone: row.phone,
                matchedLeadId: null,
                matchedLeadName: null,
                currentSalesId: null,
                currentSalesName: null,
                matchedBy: null,
                status: "skip",
                reason: "lead_not_found",
            } satisfies EvaluatedImportRow;
        }

        if (seenLeadIds.has(matchedLead.id)) {
            return {
                rowNumber: row.rowNumber,
                sourceLeadId: row.leadId,
                sourcePhone: row.phone,
                matchedLeadId: matchedLead.id,
                matchedLeadName: matchedLead.name,
                currentSalesId: matchedLead.assignedTo,
                currentSalesName: matchedLead.currentSalesName,
                matchedBy,
                status: "skip",
                reason: "duplicate_row_for_lead",
            } satisfies EvaluatedImportRow;
        }

        seenLeadIds.add(matchedLead.id);

        if (matchedLead.assignedTo === targetSalesId) {
            return {
                rowNumber: row.rowNumber,
                sourceLeadId: row.leadId,
                sourcePhone: row.phone,
                matchedLeadId: matchedLead.id,
                matchedLeadName: matchedLead.name,
                currentSalesId: matchedLead.assignedTo,
                currentSalesName: matchedLead.currentSalesName,
                matchedBy,
                status: "ready",
                reason: "already_assigned_to_target",
            } satisfies EvaluatedImportRow;
        }

        if (row.oldSalesId && matchedLead.assignedTo && matchedLead.assignedTo !== row.oldSalesId) {
            return {
                rowNumber: row.rowNumber,
                sourceLeadId: row.leadId,
                sourcePhone: row.phone,
                matchedLeadId: matchedLead.id,
                matchedLeadName: matchedLead.name,
                currentSalesId: matchedLead.assignedTo,
                currentSalesName: matchedLead.currentSalesName,
                matchedBy,
                status: "skip",
                reason: "owner_changed_since_export",
            } satisfies EvaluatedImportRow;
        }

        return {
            rowNumber: row.rowNumber,
            sourceLeadId: row.leadId,
            sourcePhone: row.phone,
            matchedLeadId: matchedLead.id,
            matchedLeadName: matchedLead.name,
            currentSalesId: matchedLead.assignedTo,
            currentSalesName: matchedLead.currentSalesName,
            matchedBy,
            status: "ready",
            reason: null,
        } satisfies EvaluatedImportRow;
    });
}

async function previewOrPrepareReassignment(
    input: { csvText?: string; rows?: unknown[] },
    targetSalesId: string,
    actor: AdminActor
) {
    assertAdminActor(actor);

    const targetSales = await getManagedSalesRow(targetSalesId, actor, true);
    if (!targetSales) {
        throw new Error("TARGET_SALES_NOT_FOUND");
    }

    if (!targetSales.clientId) {
        throw new Error("TARGET_SALES_CLIENT_NOT_FOUND");
    }

    const parsedRows = mapParsedRowsFromInput(input);
    const candidateLeads = await loadCandidateLeads(parsedRows, targetSales.clientId);
    const evaluatedRows = evaluateImportRows(parsedRows, candidateLeads, targetSales.id);

    return {
        targetSales,
        candidateLeads,
        evaluatedRows,
    };
}

export async function previewLeadReassignmentImport(
    input: { csvText?: string; rows?: unknown[] },
    targetSalesId: string,
    actor: AdminActor
) {
    const { targetSales, evaluatedRows } = await previewOrPrepareReassignment(
        input,
        targetSalesId,
        actor
    );

    const summary = {
        totalRows: evaluatedRows.length,
        ready: evaluatedRows.filter((row) => row.status === "ready").length,
        skipped: evaluatedRows.filter((row) => row.status === "skip").length,
        errors: evaluatedRows.filter((row) => row.status === "error").length,
    };

    return {
        targetSales,
        summary,
        rows: evaluatedRows,
    };
}

export async function commitLeadReassignmentImport(params: {
    csvText?: string;
    rows?: unknown[];
    targetSalesId: string;
    actor: AdminActor;
    fileName?: string;
}) {
    const { targetSales, candidateLeads, evaluatedRows } = await previewOrPrepareReassignment(
        {
            csvText: params.csvText,
            rows: params.rows,
        },
        params.targetSalesId,
        params.actor
    );

    const candidateLeadMap = new Map(candidateLeads.map((item) => [item.id, item]));
    const readyRows = evaluatedRows.filter((row) => row.status === "ready" && row.matchedLeadId);
    const batchId = readyRows.length > 0 ? generateId() : null;
    let updatedCount = 0;

    if (readyRows.length > 0) {
        await db.transaction(async (tx) => {
            for (const row of readyRows) {
                const currentLead = candidateLeadMap.get(row.matchedLeadId!);
                if (!currentLead) {
                    continue;
                }

                const nextFlowStatus =
                    !currentLead.assignedTo || currentLead.flowStatus === "open"
                        ? "assigned"
                        : currentLead.flowStatus;

                await tx
                    .update(lead)
                    .set({
                        assignedTo: targetSales.id,
                        flowStatus: nextFlowStatus,
                        updatedAt: new Date(),
                    })
                    .where(eq(lead.id, currentLead.id));

                await tx.insert(activity).values({
                    id: generateId(),
                    leadId: currentLead.id,
                    type: "note",
                    note: `Lead dipindahkan ke sales ${targetSales.name} melalui import reassign.`,
                    timestamp: new Date(),
                });

                await tx.insert(leadReassignmentAudit).values({
                    id: generateId(),
                    leadId: currentLead.id,
                    fromSalesId: currentLead.assignedTo,
                    toSalesId: targetSales.id,
                    triggeredByUserId: params.actor.actorId,
                    source: "csv_import_reassign",
                    importBatchId: batchId,
                    metadata: JSON.stringify({
                        rowNumber: row.rowNumber,
                        matchedBy: row.matchedBy,
                        fileName: params.fileName || null,
                        currentSalesName: row.currentSalesName || null,
                    }),
                    createdAt: new Date(),
                });

                await syncLeadAppointmentsSalesOwner({
                    leadId: currentLead.id,
                    salesId: targetSales.id,
                    executor: tx,
                });

                updatedCount += 1;
            }
        });
    }

    return {
        batchId,
        targetSales,
        summary: {
            totalRows: evaluatedRows.length,
            updated: updatedCount,
            skipped: evaluatedRows.filter((row) => row.status === "skip").length,
            errors: evaluatedRows.filter((row) => row.status === "error").length,
        },
        rows: evaluatedRows.map((row) => (
            row.status === "ready"
                ? { ...row, status: "updated" }
                : row
        )),
    };
}
