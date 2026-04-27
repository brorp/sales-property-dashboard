import test from "node:test";
import assert from "node:assert/strict";
import { isWithinOperationalHours } from "./operational-hours";

test("operational hours treat closing minute as closed", () => {
    assert.equal(
        isWithinOperationalHours({
            nowMinute: 20 * 60 + 59,
            startMinute: 9 * 60,
            endMinute: 21 * 60,
        }),
        true
    );

    assert.equal(
        isWithinOperationalHours({
            nowMinute: 21 * 60,
            startMinute: 9 * 60,
            endMinute: 21 * 60,
        }),
        false
    );
});

test("overnight operational hours still close at the configured end minute", () => {
    assert.equal(
        isWithinOperationalHours({
            nowMinute: 23 * 60,
            startMinute: 21 * 60,
            endMinute: 6 * 60,
        }),
        true
    );

    assert.equal(
        isWithinOperationalHours({
            nowMinute: 6 * 60,
            startMinute: 21 * 60,
            endMinute: 6 * 60,
        }),
        false
    );
});
