import { FIXED_LEAD_SOURCE_OPTIONS, normalizeFixedLeadSource } from "../constants/lead-sources";

export async function listLeadSources(clientId?: string | null) {
    if (!clientId) {
        return [];
    }

    return FIXED_LEAD_SOURCE_OPTIONS.map((value, index) => ({
        id: `fixed-${clientId}-${index + 1}`,
        clientId,
        value,
        createdAt: null,
        updatedAt: null,
    }));
}

export async function createLeadSource(params: {
    clientId: string;
    value: string;
}) {
    const value = normalizeFixedLeadSource(params.value);
    if (!value) {
        throw new Error("LEAD_SOURCE_VALUE_REQUIRED");
    }

    throw new Error("LEAD_SOURCES_FIXED");
}

export async function updateLeadSource(params: {
    id: string;
    clientId: string;
    value?: string;
}) {
    void params;
    throw new Error("LEAD_SOURCES_FIXED");
}

export async function deleteLeadSource(params: { id: string; clientId: string }) {
    void params;
    throw new Error("LEAD_SOURCES_FIXED");
}
