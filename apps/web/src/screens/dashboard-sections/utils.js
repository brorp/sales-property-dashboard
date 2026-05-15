export function formatCount(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value || 0));
}

export function getPillButtonStyle(active) {
    return {
        cursor: 'pointer', padding: '8px 14px', borderRadius: '999px',
        border: active ? 'none' : '1px solid var(--border-color)',
        background: active ? 'var(--primary)' : 'var(--bg-card)',
        color: active ? 'white' : 'var(--text-primary)',
        fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
    };
}

export function buildConicGradient(items) {
    const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
    if (total <= 0) return '#F1F5F9';
    let cursor = 0;
    const segments = items.filter((i) => i.count > 0).map((item) => {
        const start = (cursor / total) * 360;
        cursor += item.count;
        return `${item.color} ${start}deg ${(cursor / total) * 360}deg`;
    });
    return `conic-gradient(${segments.join(', ')})`;
}

export function getTeamDisplayLabel(team) {
    if (!team) return '';
    if (team.teamId === 'unassigned_sup' || team.teamName === 'Unassigned Supervisor') return 'PIC Agent';
    return team.teamName;
}
