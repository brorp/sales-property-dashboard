export type AppointmentTag = "none" | "mau_survey" | "sudah_survey";

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
          }
        | null
        | undefined,
    now: Date = new Date()
): AppointmentTag {
    if (!appointment) {
        return "none";
    }

    const appointmentAt = toAppointmentDateTime(appointment.date, appointment.time);
    return appointmentAt.getTime() > now.getTime() ? "mau_survey" : "sudah_survey";
}
