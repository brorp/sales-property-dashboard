export const USERS = [
    { id: 'admin-1', name: 'Ryan Admin', email: 'admin@propertylounge.id', password: 'admin123', role: 'admin' },
    { id: 'sales-1', name: 'Andi Pratama', email: 'andi@propertylounge.id', password: 'sales123', role: 'sales' },
    { id: 'sales-2', name: 'Budi Setiawan', email: 'budi@propertylounge.id', password: 'sales123', role: 'sales' },
    { id: 'sales-3', name: 'Citra Dewi', email: 'citra@propertylounge.id', password: 'sales123', role: 'sales' },
    { id: 'sales-4', name: 'Dian Saputra', email: 'dian@propertylounge.id', password: 'sales123', role: 'sales' },
];

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const hoursAgo = (n) => new Date(now.getTime() - n * 3600000).toISOString();

export const INITIAL_LEADS = [
    {
        id: 'lead-1', name: 'Ahmad Fauzi', phone: '081234567890', source: 'Meta Ads - Kampanye Residensial Q1',
        assignedTo: 'sales-1', createdAt: hoursAgo(2), clientStatus: 'hot', progress: 'follow-up',
        activities: [
            { id: 1, type: 'follow-up', note: 'Client tertarik unit tipe 36, minta brosur digital', timestamp: hoursAgo(1) },
            { id: 2, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: hoursAgo(2) },
        ], appointments: [],
    },
    {
        id: 'lead-2', name: 'Siti Aminah', phone: '081322223333', source: 'Meta Ads - Promo Akhir Tahun',
        assignedTo: 'sales-2', createdAt: daysAgo(1), clientStatus: 'warm', progress: 'follow-up',
        activities: [
            { id: 3, type: 'follow-up', note: 'Sudah hubungi via WA, client minta waktu diskusi keluarga', timestamp: hoursAgo(5) },
            { id: 4, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(1) },
        ], appointments: [],
    },
    {
        id: 'lead-3', name: 'Rudi Hermawan', phone: '085711114444', source: 'Meta Ads - Kampanye Residensial Q1',
        assignedTo: 'sales-3', createdAt: daysAgo(3), clientStatus: 'cold', progress: 'pending',
        activities: [
            { id: 5, type: 'pending', note: 'Client belum membalas WA, coba hubungi lagi besok', timestamp: daysAgo(1) },
            { id: 6, type: 'follow-up', note: 'Menghubungi via WA, belum dibalas', timestamp: daysAgo(2) },
            { id: 7, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(3) },
        ], appointments: [],
    },
    {
        id: 'lead-4', name: 'Maria Chen', phone: '081299998888', source: 'Meta Ads - Promo Akhir Tahun',
        assignedTo: 'sales-1', createdAt: daysAgo(5), clientStatus: 'hot', progress: 'appointment',
        activities: [
            { id: 8, type: 'appointment', note: 'Appointment dibuat: site visit PIK 2, unit tipe 54', timestamp: daysAgo(1) },
            { id: 9, type: 'follow-up', note: 'Client sangat antusias, mau lihat unit langsung', timestamp: daysAgo(2) },
            { id: 10, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(5) },
        ], appointments: [{ id: 1, date: '2026-02-23', time: '14:00', location: 'PIK 2, Jakarta Utara', notes: 'Site visit unit tipe 54' }],
    },
    {
        id: 'lead-5', name: 'Dewi Lestari', phone: '087855556666', source: 'Meta Ads - Kampanye Residensial Q1',
        assignedTo: 'sales-1', createdAt: daysAgo(7), clientStatus: 'warm', progress: 'pending',
        activities: [
            { id: 11, type: 'pending', note: 'Menunggu keputusan client setelah diskusi dengan suami', timestamp: daysAgo(2) },
            { id: 12, type: 'follow-up', note: 'Sudah kirim price list dan brosur', timestamp: daysAgo(4) },
            { id: 13, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(7) },
        ], appointments: [],
    },
    {
        id: 'lead-6', name: 'Budi Santoso', phone: '081377779999', source: 'Meta Ads - Kampanye Komersial',
        assignedTo: 'sales-2', createdAt: daysAgo(2), clientStatus: 'hot', progress: 'new',
        activities: [{ id: 14, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(2) }], appointments: [],
    },
    {
        id: 'lead-7', name: 'Jessica Tanadi', phone: '081244443333', source: 'Meta Ads - Promo Akhir Tahun',
        assignedTo: 'sales-3', createdAt: daysAgo(10), clientStatus: 'cold', progress: 'rejected',
        activities: [
            { id: 15, type: 'rejected', note: 'Client memutuskan tidak melanjutkan, budget tidak mencukupi', timestamp: daysAgo(3) },
            { id: 16, type: 'follow-up', note: 'Sudah presentasi unit, client keberatan soal harga', timestamp: daysAgo(5) },
            { id: 17, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(10) },
        ], appointments: [],
    },
    {
        id: 'lead-8', name: 'Hendra Wijaya', phone: '081566667777', source: 'Meta Ads - Kampanye Residensial Q1',
        assignedTo: 'sales-4', createdAt: daysAgo(14), clientStatus: 'hot', progress: 'closed',
        activities: [
            { id: 18, type: 'closed', note: 'DEAL! Client membeli unit tipe 45 blok A-12', timestamp: daysAgo(1) },
            { id: 19, type: 'appointment', note: 'Site visit berhasil, client sangat tertarik', timestamp: daysAgo(5) },
            { id: 20, type: 'follow-up', note: 'Mengirim proposal dan price list', timestamp: daysAgo(8) },
            { id: 21, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(14) },
        ], appointments: [{ id: 2, date: '2026-02-16', time: '10:00', location: 'BSD City, Tangerang', notes: 'Site visit unit tipe 45' }],
    },
    {
        id: 'lead-9', name: 'Rina Marlina', phone: '082188889999', source: 'Meta Ads - Kampanye Komersial',
        assignedTo: 'sales-4', createdAt: daysAgo(4), clientStatus: 'warm', progress: 'follow-up',
        activities: [
            { id: 22, type: 'follow-up', note: 'Client minta detail cicilan KPR', timestamp: daysAgo(1) },
            { id: 23, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(4) },
        ], appointments: [],
    },
    {
        id: 'lead-10', name: 'Tommy Susanto', phone: '081333442211', source: 'Meta Ads - Kampanye Residensial Q1',
        assignedTo: 'sales-2', createdAt: daysAgo(6), clientStatus: 'hot', progress: 'closed',
        activities: [
            { id: 24, type: 'closed', note: 'DEAL! Pembelian unit tipe 36 blok C-05, cash bertahap', timestamp: daysAgo(1) },
            { id: 25, type: 'appointment', note: 'Meeting final di kantor untuk tanda tangan', timestamp: daysAgo(2) },
            { id: 26, type: 'follow-up', note: 'Negosiasi harga dan skema pembayaran', timestamp: daysAgo(4) },
            { id: 27, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(6) },
        ], appointments: [{ id: 3, date: '2026-02-19', time: '11:00', location: 'Kantor Property Lounge', notes: 'Final signing' }],
    },
    {
        id: 'lead-11', name: 'Fitri Handayani', phone: '087899990000', source: 'Meta Ads - Promo Akhir Tahun',
        assignedTo: 'sales-3', createdAt: daysAgo(1), clientStatus: 'warm', progress: 'new',
        activities: [{ id: 28, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(1) }], appointments: [],
    },
    {
        id: 'lead-12', name: 'Agus Prabowo', phone: '081511112222', source: 'Meta Ads - Kampanye Komersial',
        assignedTo: 'sales-1', createdAt: daysAgo(8), clientStatus: 'cold', progress: 'pending',
        activities: [
            { id: 29, type: 'pending', note: 'Client masih mikir-mikir, follow up minggu depan', timestamp: daysAgo(3) },
            { id: 30, type: 'follow-up', note: 'Sudah presentasi produk via video call', timestamp: daysAgo(5) },
            { id: 31, type: 'new', note: 'Lead masuk dari Meta Ads', timestamp: daysAgo(8) },
        ], appointments: [],
    },
];

export const PROGRESS_STEPS = [
    { key: 'new', label: 'New', icon: '📥' },
    { key: 'follow-up', label: 'Follow-up', icon: '📞' },
    { key: 'pending', label: 'Pending', icon: '⏳' },
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

export function getSalesName(salesId) {
    const user = USERS.find(u => u.id === salesId);
    return user ? user.name : 'Unassigned';
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
