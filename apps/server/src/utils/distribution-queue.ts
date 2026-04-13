export function projectNextSessionQueue<T extends { id: string }>(
    queueRows: T[],
    attemptedSalesIds: string[]
) {
    const safeRows = Array.isArray(queueRows) ? [...queueRows] : [];
    if (safeRows.length <= 1) {
        return safeRows;
    }

    const rowById = new Map(safeRows.map((row) => [row.id, row]));
    const orderedAttemptedIds: string[] = [];
    const seen = new Set<string>();

    for (const salesId of attemptedSalesIds || []) {
        if (typeof salesId !== "string" || salesId.trim().length === 0) {
            continue;
        }
        if (seen.has(salesId) || !rowById.has(salesId)) {
            continue;
        }
        seen.add(salesId);
        orderedAttemptedIds.push(salesId);
    }

    if (orderedAttemptedIds.length === 0) {
        return safeRows;
    }

    const attemptedSet = new Set(orderedAttemptedIds);
    const remainingRows = safeRows.filter((row) => !attemptedSet.has(row.id));
    const attemptedRows = orderedAttemptedIds
        .map((salesId) => rowById.get(salesId) || null)
        .filter((row): row is T => Boolean(row));

    return [...remainingRows, ...attemptedRows];
}
