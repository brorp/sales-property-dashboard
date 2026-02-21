import { generateId } from "../utils/id";

interface CreateCalendarEventInput {
    leadName: string;
    leadPhone: string;
    startAt: Date;
    endAt?: Date;
    location: string;
}

export async function createGoogleCalendarEvent(
    input: CreateCalendarEventInput
) {
    // Placeholder integration:
    // if Google OAuth token is available in future, replace this block
    // with real Google Calendar API event insertion.
    if (process.env.GOOGLE_CALENDAR_MOCK === "true") {
        const eventId = `mock-gcal-${generateId()}`;
        return { eventId, provider: "mock" as const };
    }

    void input;
    return { eventId: null, provider: "none" as const };
}
