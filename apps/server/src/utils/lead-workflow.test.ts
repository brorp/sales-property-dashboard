import test from "node:test";
import assert from "node:assert/strict";
import {
    DAILY_TASK_FOLLOWUP_MILESTONE_DAYS,
    DAILY_TASK_FOLLOWUP_STAGE_COUNT,
    canSubmitNewLeadTaskSalesStatus,
    canManuallySetSalesStatus,
    canSelectColdOrNoResponse,
    getPenaltyDurationHours,
    getPenaltySPLevel,
    getAllowedManualSalesStatuses,
    normalizeFlowStatus,
    normalizeResultStatus,
    normalizeSalesStatus,
} from "./lead-workflow";

test("normalize helpers map known statuses and fall back safely", () => {
    assert.equal(normalizeFlowStatus("assigned", null), "assigned");
    assert.equal(normalizeFlowStatus(null, "sales-1"), "assigned");
    assert.equal(normalizeFlowStatus(undefined, null), "open");
    assert.equal(normalizeSalesStatus("Warm"), "warm");
    assert.equal(normalizeSalesStatus("unknown"), null);
    assert.equal(normalizeResultStatus("FULL_BOOK"), "full_book");
    assert.equal(normalizeResultStatus("invalid"), null);
});

test("cold and no_response only open after lead age exceeds 14 days", () => {
    const now = new Date("2026-03-26T00:00:00.000Z");
    const freshLeadDate = new Date("2026-03-20T00:00:00.000Z");
    const oldLeadDate = new Date("2026-03-10T00:00:00.000Z");

    assert.equal(canSelectColdOrNoResponse(freshLeadDate, now), false);
    assert.equal(canSelectColdOrNoResponse(oldLeadDate, now), true);
    assert.deepEqual(getAllowedManualSalesStatuses(freshLeadDate, now), ["hot", "error", "skip"]);
    assert.deepEqual(getAllowedManualSalesStatuses(oldLeadDate, now), ["hot", "error", "skip", "cold", "no_response"]);
    assert.equal(canManuallySetSalesStatus("cold", freshLeadDate, now), false);
    assert.equal(canManuallySetSalesStatus("no_response", freshLeadDate, now), false);
    assert.equal(canManuallySetSalesStatus("hot", freshLeadDate, now), true);
});

test("daily task follow up milestones stay fixed at day 4, 8, and 12 with 3 total stages", () => {
    assert.deepEqual(DAILY_TASK_FOLLOWUP_MILESTONE_DAYS, [4, 8, 12]);
    assert.equal(DAILY_TASK_FOLLOWUP_STAGE_COUNT, 3);
});

test("new lead task allows warm immediately and opens cold/no response only after 14 days", () => {
    const now = new Date("2026-03-26T00:00:00.000Z");
    const freshLeadDate = new Date("2026-03-20T00:00:00.000Z");
    const oldLeadDate = new Date("2026-03-01T00:00:00.000Z");

    assert.equal(canSubmitNewLeadTaskSalesStatus("warm", freshLeadDate, now), true);
    assert.equal(canSubmitNewLeadTaskSalesStatus("hot", freshLeadDate, now), true);
    assert.equal(canSubmitNewLeadTaskSalesStatus("cold", freshLeadDate, now), false);
    assert.equal(canSubmitNewLeadTaskSalesStatus("no_response", freshLeadDate, now), false);
    assert.equal(canSubmitNewLeadTaskSalesStatus("cold", oldLeadDate, now), true);
    assert.equal(canSubmitNewLeadTaskSalesStatus("no_response", oldLeadDate, now), true);
});

test("daily task penalty escalation resolves duration hours and SP level from penalty sequence", () => {
    assert.equal(getPenaltyDurationHours(1), 24);
    assert.equal(getPenaltyDurationHours(2), 48);
    assert.equal(getPenaltyDurationHours(3), 96);
    assert.equal(getPenaltyDurationHours(9), 96);

    assert.equal(getPenaltySPLevel(1), "none");
    assert.equal(getPenaltySPLevel(2), "none");
    assert.equal(getPenaltySPLevel(3), "sp1");
    assert.equal(getPenaltySPLevel(4), "sp2");
    assert.equal(getPenaltySPLevel(5), "sp3");
    assert.equal(getPenaltySPLevel(8), "sp3");
});
