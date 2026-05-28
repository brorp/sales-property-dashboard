const KNOWN_CLIENT_TITLES = [
    { title: 'Avoria', needles: ['avoria'] },
    { title: 'Widari', needles: ['widari'] },
];

function normalizeTitleSource(value) {
    return String(value || '').trim();
}

export function getCrmClientTitle(value, fallback = 'Property Lounge') {
    const source = normalizeTitleSource(value);
    const normalized = source.toLowerCase();

    for (const item of KNOWN_CLIENT_TITLES) {
        if (item.needles.some((needle) => normalized.includes(needle))) {
            return item.title;
        }
    }

    return source || fallback;
}

export function buildCrmTitle(value, fallback = 'Property Lounge') {
    return `${getCrmClientTitle(value, fallback)} - CRM`;
}

export function buildCrmTitleFromHost(host) {
    return buildCrmTitle(host, 'Property Lounge');
}
