export const FIXED_LEAD_SOURCE_OPTIONS = ["Online", "Offline", "Walk In", "Agent"] as const;

export type FixedLeadSource = (typeof FIXED_LEAD_SOURCE_OPTIONS)[number];

export function isFixedLeadSource(value: unknown): value is FixedLeadSource {
    if (typeof value !== "string") {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return FIXED_LEAD_SOURCE_OPTIONS.some((item) => item.toLowerCase() === normalized);
}

export function normalizeFixedLeadSource(value: unknown): FixedLeadSource | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    return FIXED_LEAD_SOURCE_OPTIONS.find((item) => item.toLowerCase() === normalized) || null;
}
