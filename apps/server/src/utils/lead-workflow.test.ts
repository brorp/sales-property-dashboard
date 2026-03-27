import test from "node:test";
import assert from "node:assert/strict";
import {
    canManuallySetSalesStatus,
    canSelectColdOrNoResponse,
    CUSTOMER_PIPELINE_STEP_COUNT,
    getCustomerPipelineSuspensionDays,
    getAllowedManualSalesStatuses,
    isCustomerPipelinePenaltyDue,
    normalizeFlowStatus,
    normalizeResultStatus,
    normalizeSalesStatus,
    resolveCustomerPipelinePenaltyLayer,
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

test("customer pipeline penalty only applies to overdue warm leads with incomplete checklist", () => {
    const now = new Date("2026-03-26T00:00:00.000Z");
    const acceptedAt = new Date("2026-03-01T00:00:00.000Z");

    assert.equal(isCustomerPipelinePenaltyDue({
        acceptedAt,
        salesStatus: "warm",
        checkedCount: 0,
        now,
    }), true);

    assert.equal(isCustomerPipelinePenaltyDue({
        acceptedAt,
        salesStatus: "warm",
        checkedCount: CUSTOMER_PIPELINE_STEP_COUNT,
        now,
    }), false);

    assert.equal(isCustomerPipelinePenaltyDue({
        acceptedAt,
        salesStatus: "hot",
        checkedCount: 0,
        now,
    }), false);

    assert.equal(isCustomerPipelinePenaltyDue({
        acceptedAt: new Date("2026-03-20T00:00:00.000Z"),
        salesStatus: "warm",
        checkedCount: 0,
        now,
    }), false);
});

test("customer pipeline penalty escalation resolves layer and suspension days per prior history", () => {
    assert.equal(resolveCustomerPipelinePenaltyLayer(0), 1);
    assert.equal(resolveCustomerPipelinePenaltyLayer(1), 2);
    assert.equal(resolveCustomerPipelinePenaltyLayer(2), 3);
    assert.equal(resolveCustomerPipelinePenaltyLayer(8), 3);

    assert.equal(getCustomerPipelineSuspensionDays(1), 1);
    assert.equal(getCustomerPipelineSuspensionDays(2), 3);
    assert.equal(getCustomerPipelineSuspensionDays(3), 7);
    assert.equal(getCustomerPipelineSuspensionDays(5), 7);
});
