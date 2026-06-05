export const DATE_PRESET_OPTIONS = [
    { value: 'today', key: 'today', label: 'Hari Ini' },
    { value: 'thisMonth', key: 'thisMonth', label: 'Bulan Ini' },
    { value: 'lastMonth', key: 'lastMonth', label: 'Bulan Kemarin' },
    { value: 'last7', key: 'last7', label: '7 Hari Terakhir' },
    { value: 'last30', key: 'last30', label: '30 Hari Terakhir' },
    { value: 'last90', key: 'last90', label: '90 Hari Terakhir' },
    { value: 'thisYear', key: 'thisYear', label: 'Tahun Ini' },
];

export function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDateInput(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;
    const next = new Date(year, month - 1, day);
    return Number.isNaN(next.getTime()) ? null : next;
}

export function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);

    if (key === 'today') {
        return { dateFrom: end, dateTo: end };
    }

    if (key === 'last7') {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }

    if (key === 'last30') {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }

    if (key === 'last90') {
        const start = new Date(today);
        start.setDate(today.getDate() - 89);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }

    if (key === 'lastMonth') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const finish = new Date(today.getFullYear(), today.getMonth(), 0);
        return { dateFrom: formatDateInput(start), dateTo: formatDateInput(finish) };
    }

    if (key === 'thisYear') {
        const start = new Date(today.getFullYear(), 0, 1);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }

    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: formatDateInput(start), dateTo: end };
}
