import { normalizePhone } from "../utils/phone";

const DEFAULT_PROPERTY_LOUNGE_WA = "+620000000000";

let activeWhatsAppNumber: string | null = null;

function getFallbackWhatsAppNumber() {
    return normalizePhone(process.env.PROPERTY_LOUNGE_WA || DEFAULT_PROPERTY_LOUNGE_WA);
}

export function setActiveWhatsAppNumber(input?: string | null) {
    activeWhatsAppNumber = input ? normalizePhone(input) : null;
}

export function clearActiveWhatsAppNumber() {
    activeWhatsAppNumber = null;
}

export function getActiveWhatsAppNumber() {
    return activeWhatsAppNumber || getFallbackWhatsAppNumber();
}

export function getActiveWhatsAppNumberState() {
    return activeWhatsAppNumber;
}
