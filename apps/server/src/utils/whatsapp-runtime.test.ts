import test from "node:test";
import assert from "node:assert/strict";
import {
    attemptCountsAsDeliveredOffer,
    buildWhatsAppReplyMarker,
    buildWhatsAppQueueReliabilityConfig,
    getWhatsAppOutboxRetryDelayMs,
    isTransientWhatsAppDeliveryFailure,
    shouldReconcileWhatsAppOutbox,
    shouldDisableMissedMessageRecovery,
    validateWorkspaceWhatsAppIdentity,
} from "./whatsapp-runtime";

test("workspace WhatsApp identity rejects a connected number from another workspace", () => {
    assert.deepEqual(
        validateWorkspaceWhatsAppIdentity({
            expectedNumber: "+6282320662323",
            connectedNumber: "+6287810100090",
        }),
        {
            valid: false,
            reason: "number_mismatch",
            expectedNumber: "+6282320662323",
            connectedNumber: "+6287810100090",
        }
    );
});

test("durable reply marker reuses the lead identifier and distinguishes reply type", () => {
    assert.equal(buildWhatsAppReplyMarker("4z-j42l", "claim"), "[lid] 4ZJ42L [claim]");
    assert.notEqual(
        buildWhatsAppReplyMarker("4ZJ42L", "claim"),
        buildWhatsAppReplyMarker("4ZJ42L", "late")
    );
});

test("WhatsApp outbox retries back off and reconcile every attempt after the first", () => {
    assert.equal(getWhatsAppOutboxRetryDelayMs(1), 15_000);
    assert.equal(getWhatsAppOutboxRetryDelayMs(2), 30_000);
    assert.equal(getWhatsAppOutboxRetryDelayMs(20), 300_000);
    assert.equal(shouldReconcileWhatsAppOutbox(1, "[lid] ABC123 [claim]"), false);
    assert.equal(shouldReconcileWhatsAppOutbox(2, "[lid] ABC123 [claim]"), true);
    assert.equal(shouldReconcileWhatsAppOutbox(2, null), false);
});

test("workspace WhatsApp identity accepts equivalent normalized phone formats", () => {
    assert.equal(
        validateWorkspaceWhatsAppIdentity({
            expectedNumber: "0823-2066-2323",
            connectedNumber: "+62 823 2066 2323",
        }).valid,
        true
    );
});

test("workspace WhatsApp identity remains backward compatible when no number is configured", () => {
    assert.equal(
        validateWorkspaceWhatsAppIdentity({
            expectedNumber: null,
            connectedNumber: "+6282320662323",
        }).valid,
        true
    );
});

test("WhatsApp queue reliability config prevents BullMQ from replaying stalled sends", () => {
    const config = buildWhatsAppQueueReliabilityConfig({
        queueMaxDelayMs: 20_000,
        sendTimeoutMs: 60_000,
        configuredLockDurationMs: 30_000,
        configuredWaitTimeoutMs: 60_000,
    });

    assert.equal(config.maxStalledCount, 0);
    assert.ok(config.lockDurationMs >= 110_000);
    assert.ok(config.waitTimeoutMs > config.lockDurationMs);
});

test("temporary WhatsApp failures pause distribution and remain retryable", () => {
    for (const error of [
        "WA_SEND_TIMEOUT",
        "WA_QUEUE_DELIVERY_UNCERTAIN",
        "WA_SESSION_NOT_CONNECTED",
        "WA_WORKSPACE_IDENTITY_MISMATCH",
        "QR WhatsApp client is not connected yet",
        "Execution context was destroyed",
    ]) {
        assert.equal(isTransientWhatsAppDeliveryFailure(error), true, error);
    }

    assert.equal(isTransientWhatsAppDeliveryFailure("Sales phone is empty"), false);
    assert.equal(
        attemptCountsAsDeliveredOffer({
            status: "closed",
            closeReason: "send_uncertain_transient",
        }),
        false
    );
    assert.equal(
        attemptCountsAsDeliveredOffer({
            status: "timeout",
            closeReason: "ack_timeout_5m",
        }),
        true
    );
});

test("missed-message scanner disables itself without treating scanner failures as session failures", () => {
    assert.equal(shouldDisableMissedMessageRecovery(2, 3), false);
    assert.equal(shouldDisableMissedMessageRecovery(3, 3), true);
    assert.equal(shouldDisableMissedMessageRecovery(4, 3), true);
});
