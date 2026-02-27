export const FLOW_STATUSES = [
    { key: 'open', label: 'Open' },
    { key: 'hold', label: 'Hold' },
    { key: 'assigned', label: 'Assigned' },
];

export const SALES_STATUSES = [
    { key: 'hot', label: 'Hot' },
    { key: 'warm', label: 'Warm' },
    { key: 'cold', label: 'Cold' },
    { key: 'error', label: 'Error' },
    { key: 'no_response', label: 'No Response' },
    { key: 'skip', label: 'Skip' },
];

export const APPOINTMENT_TAGS = [
    { key: 'mau_survey', label: 'Mau Survey' },
    { key: 'sudah_survey', label: 'Sudah Survey' },
];

export const RESULT_STATUSES = [
    { key: 'closing', label: 'Closing' },
    { key: 'menunggu', label: 'Menunggu' },
    { key: 'batal', label: 'Batal' },
];

export const REJECTED_REASON_OPTIONS = [
    { key: 'harga', label: 'Harga' },
    { key: 'lokasi', label: 'Lokasi' },
    { key: 'kompetitor', label: 'Pilih Kompetitor' },
    { key: 'belum_siap', label: 'Belum Siap Beli' },
    { key: 'tidak_responsif', label: 'Tidak Responsif' },
    { key: 'tidak_cocok', label: 'Produk Tidak Cocok' },
    { key: 'lainnya', label: 'Lainnya' },
];

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
    const found = REJECTED_REASON_OPTIONS.find((item) => item.key === key);
    return found ? found.label : key || '-';
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
