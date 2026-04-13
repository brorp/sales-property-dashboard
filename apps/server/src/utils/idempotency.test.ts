import test from "node:test";
import assert from "node:assert/strict";

function stableSerialize(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries
            .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
            .join(",")}}`;
    }
    return JSON.stringify(String(value));
}

test("stableSerialize creates the same signature for equal objects regardless of key order", () => {
    const first = {
        location: "Lobby",
        date: "2026-04-20",
        time: "13:00",
        notes: "Test",
    };

    const second = {
        notes: "Test",
        time: "13:00",
        date: "2026-04-20",
        location: "Lobby",
    };

    assert.equal(stableSerialize(first), stableSerialize(second));
});

test("stableSerialize preserves array order while normalizing nested objects", () => {
    const first = [
        { b: 2, a: 1 },
        { label: "X", active: true },
    ];

    const second = [
        { a: 1, b: 2 },
        { active: true, label: "X" },
    ];

    assert.equal(stableSerialize(first), stableSerialize(second));
});
