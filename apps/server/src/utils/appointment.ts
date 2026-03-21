export type AppointmentTag = "none" | "mau_survey" | "sudah_survey" | "dibatalkan";

function safeDatePart(dateValue: string) {
    if (!dateValue || typeof dateValue !== "string") {
        return "1970-01-01";
    }
    return dateValue.slice(0, 10);
}

function safeTimePart(timeValue: string) {
    if (!timeValue || typeof timeValue !== "string") {
        return "00:00";
    }
    return timeValue.slice(0, 5);
}

export function toAppointmentDateTime(dateValue: string, timeValue: string) {
    const isoLike = `${safeDatePart(dateValue)}T${safeTimePart(timeValue)}:00`;
    const dt = new Date(isoLike);
    if (Number.isNaN(dt.getTime())) {
        return new Date(0);
    }
    return dt;
}

export function resolveAppointmentTag(
    appointment:
        | {
              date: string;
              time: string;
              status?: string | null;
          }
        | null
        | undefined
): AppointmentTag {
    if (!appointment) {
        return "none";
    }

    const normalizedStatus = String(appointment.status || "").trim().toLowerCase();
    if (
        normalizedStatus === "mau_survey" ||
        normalizedStatus === "sudah_survey" ||
        normalizedStatus === "dibatalkan"
    ) {
        return normalizedStatus;
    }

    const appointmentAt = toAppointmentDateTime(appointment.date, appointment.time);
    return appointmentAt.getTime() > Date.now() ? "mau_survey" : "sudah_survey";
}

export function sanitizeAppointmentStatus(value: unknown): AppointmentTag {
    const normalized = String(value || "").trim().toLowerCase();
    if (
        normalized === "mau_survey" ||
        normalized === "sudah_survey" ||
        normalized === "dibatalkan"
    ) {
        return normalized;
    }

    return "mau_survey";
}
