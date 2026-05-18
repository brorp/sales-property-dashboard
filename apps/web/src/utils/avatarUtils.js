const AVATAR_BG_PALETTE = [
    '#DBEAFE',
    '#EDE9FE',
    '#CCFBF1',
    '#FCE7F3',
    '#DCFCE7',
    '#FED7AA',
    '#E0E7FF',
    '#CFFAFE',
    '#FEF9C3',
    '#FFE4E6',
];

export function getAvatarBg(name) {
    const str = String(name || '?');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return AVATAR_BG_PALETTE[hash % AVATAR_BG_PALETTE.length];
}

export function getInitial(name) {
    return String(name || '?').charAt(0).toUpperCase();
}

export function getInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}
