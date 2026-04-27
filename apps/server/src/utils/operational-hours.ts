export function isWithinOperationalHours(params: {
    nowMinute: number;
    startMinute: number;
    endMinute: number;
}) {
    const { nowMinute, startMinute, endMinute } = params;

    if (startMinute < endMinute) {
        return nowMinute >= startMinute && nowMinute < endMinute;
    }

    return nowMinute >= startMinute || nowMinute < endMinute;
}
