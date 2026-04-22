export const FLOW_STATUSES = [
    { key: 'open', label: 'Open' },
    { key: 'hold', label: 'Hold' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'accepted', label: 'Accepted' },
];

export const SALES_STATUSES = [
    { key: 'warm', label: 'Warm' },
    { key: 'hot', label: 'Hot' },
    { key: 'error', label: 'Error' },
    { key: 'cold', label: 'Cold' },
    { key: 'no_response', label: 'No Response' },
    { key: 'skip', label: 'Skip' },
];

export const APPOINTMENT_TAGS = [
    { key: 'mau_survey', label: 'Mau Survey' },
    { key: 'sudah_survey', label: 'Sudah Survey' },
    { key: 'dibatalkan', label: 'Dibatalkan' },
];

export const RESULT_STATUSES = [
    { key: 'reserve', label: 'Reserve' },
    { key: 'on_process', label: 'On process' },
    { key: 'full_book', label: 'Full Book' },
    { key: 'akad', label: 'Akad' },
    { key: 'cancel', label: 'Cancel' },
];

export const DAILY_TASK_FOLLOWUP_MILESTONE_DAYS = [4, 8, 12];

export const CUSTOMER_PIPELINE_STEPS = Array.from({ length: 3 }, (_, index) => ({
    stepNo: index + 1,
    label: `Follow Up ${index + 1}`,
}));

export const SALES_STATUS_COLD_OPEN_DAYS = 14;

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

function humanizeUnknownKey(key) {
    return String(key || '-')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getSalesStatusLabel(key) {
    if (key === 'unfilled') {
        return 'Belum Diisi';
    }
    const found = SALES_STATUSES.find((item) => item.key === key);
    return found ? found.label : key || '-';
}

export function getResultStatusLabel(key) {
    const found = RESULT_STATUSES.find((item) => item.key === key);
    return found ? found.label : key || '-';
}

export function getFlowStatusLabel(key) {
    const found = FLOW_STATUSES.find((item) => item.key === key);
    return found ? found.label : key || '-';
}

export function getAppointmentTagLabel(key) {
    const found = APPOINTMENT_TAGS.find((item) => item.key === key);
    return found ? found.label : key || '-';
}

export function getRejectedReasonLabel(key) {
    return humanizeUnknownKey(key);
}

export function getStatusBadgeClass(kind, value) {
    const normalizedKind = normalizeKey(kind);
    const normalizedValue = normalizeKey(value);

    if (normalizedKind === 'flow') {
        if (normalizedValue === 'assigned' || normalizedValue === 'accepted') {
            return 'badge-warm';
        }
        if (normalizedValue === 'hold') {
            return 'badge-purple';
        }
        return 'badge-neutral';
    }

    if (normalizedKind === 'sales') {
        if (normalizedValue === 'warm' || normalizedValue === 'hot') {
            return 'badge-warm';
        }
        if (normalizedValue === 'cold' || normalizedValue === 'error' || normalizedValue === 'no_response' || normalizedValue === 'skip') {
            return 'badge-danger';
        }
        return 'badge-neutral';
    }

    if (normalizedKind === 'appointment') {
        if (normalizedValue === 'mau_survey') {
            return 'badge-info';
        }
        if (normalizedValue === 'sudah_survey') {
            return 'badge-survey';
        }
        if (normalizedValue === 'dibatalkan') {
            return 'badge-danger';
        }
        return 'badge-neutral';
    }

    if (normalizedKind === 'result') {
        if (normalizedValue === 'akad' || normalizedValue === 'full_book') {
            return 'badge-success';
        }
        if (normalizedValue === 'reserve' || normalizedValue === 'on_process') {
            return 'badge-warm';
        }
        if (normalizedValue === 'cancel') {
            return 'badge-danger';
        }
        return 'badge-neutral';
    }

    return 'badge-neutral';
}

export function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins} menit lalu`;
    if (hours < 24) return `${hours} jam lalu`;
    if (days < 7) return `${days} hari lalu`;
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function toWaLink(phone) {
    const raw = String(phone || '').replace(/[^\d]/g, '');
    if (!raw) {
        return '#';
    }
    const normalized = raw.startsWith('0') ? `62${raw.slice(1)}` : raw;
    return `https://wa.me/${normalized}`;
}
