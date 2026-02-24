export const PROGRESS_STEPS = [
    { key: 'pending', label: 'Pending', icon: '⏳' },
    { key: 'prospecting', label: 'Prospecting', icon: '🔎' },
    { key: 'follow-up', label: 'Follow-up', icon: '📞' },
    { key: 'appointment', label: 'Appointment', icon: '📅' },
    { key: 'closed', label: 'Closed', icon: '✅' },
];

export const CLIENT_STATUSES = [
    { key: 'hot', label: 'Hot Client', icon: '🔥', className: 'badge-hot' },
    { key: 'warm', label: 'Warm Client', icon: '🌡️', className: 'badge-warm' },
    { key: 'cold', label: 'Cold Client', icon: '🧊', className: 'badge-cold' },
    { key: 'lost', label: 'Lost Client', icon: '❌', className: 'badge-danger' },
    { key: 'deal', label: 'Deal', icon: '✅', className: 'badge-success' },
];

export const LAYER2_STATUSES = [
    { key: 'prospecting', label: 'Prospecting', icon: '🔎' },
    { key: 'sudah_survey', label: 'Sudah Survey', icon: '🏡' },
    { key: 'mau_survey', label: 'Mau Survey', icon: '🗓️' },
    { key: 'closing', label: 'Closing', icon: '🤝' },
    { key: 'rejected', label: 'Rejected', icon: '❌' },
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
