export function normalizePhone(input: string) {
    const digits = input.replace(/[^\d+]/g, "").trim();
    if (digits.startsWith("+")) {
        return digits;
    }

    if (digits.startsWith("0")) {
        return `+62${digits.slice(1)}`;
    }

    if (digits.startsWith("62")) {
        return `+${digits}`;
    }

    return digits.startsWith("+") ? digits : `+${digits}`;
}
