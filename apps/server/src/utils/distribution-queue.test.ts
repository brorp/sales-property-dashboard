import test from "node:test";
import assert from "node:assert/strict";
import { projectNextSessionQueue } from "./distribution-queue";

test("projectNextSessionQueue moves attempted sales to the back in offer order", () => {
    const queueRows = [
        { id: "sales-a", name: "A" },
        { id: "sales-b", name: "B" },
        { id: "sales-c", name: "C" },
        { id: "sales-d", name: "D" },
    ];

    const projected = projectNextSessionQueue(queueRows, ["sales-a", "sales-c"]);

    assert.deepEqual(
        projected.map((item) => item.id),
        ["sales-b", "sales-d", "sales-a", "sales-c"]
    );
});

test("projectNextSessionQueue ignores duplicates and unknown ids safely", () => {
    const queueRows = [
        { id: "sales-a", name: "A" },
        { id: "sales-b", name: "B" },
        { id: "sales-c", name: "C" },
    ];

    const projected = projectNextSessionQueue(queueRows, [
        "sales-b",
        "missing-sales",
        "sales-b",
    ]);

    assert.deepEqual(
        projected.map((item) => item.id),
        ["sales-a", "sales-c", "sales-b"]
    );
});
