'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import './FloatingWorkspaceButton.css';

const BTN = 50;
const PAD = 16;
const DRAG_THRESHOLD = 6;
const STORAGE_KEY = 'ws-fab-snap';

function snapPositions() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safeTop = PAD + 56;        // below any top bar
    const safeBottom = H - BTN - PAD - 72; // above bottom nav
    const midY = H / 2 - BTN / 2;
    return [
        { id: 'lt', x: PAD,          y: safeTop },
        { id: 'lm', x: PAD,          y: midY },
        { id: 'lb', x: PAD,          y: safeBottom },
        { id: 'rt', x: W - BTN - PAD, y: safeTop },
        { id: 'rm', x: W - BTN - PAD, y: midY },
        { id: 'rb', x: W - BTN - PAD, y: safeBottom },
    ];
}

function nearestSnap(x, y) {
    return snapPositions().reduce((best, p) =>
        Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best
    );
}

function loadSnap() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            // Re-calculate from snap ID in case window resized
            const pos = snapPositions().find((p) => p.id === saved.id);
            return pos || null;
        }
    } catch {}
    return null;
}

function saveSnap(snap) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: snap.id })); } catch {}
}

function initPos() {
    const saved = loadSnap();
    if (saved) return saved;
    const snaps = snapPositions();
    return snaps.find((p) => p.id === 'rm') || snaps[4];
}

function WorkspaceInitial({ name }) {
    const initials = (name || '?')
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('');
    return <span className="ws-fab-initial">{initials}</span>;
}

export default function FloatingWorkspaceButton() {
    const { workspaces, activeWorkspace, switchWorkspace, loading } = useWorkspace();

    const [pos, setPos] = useState(initPos);
    const [snapping, setSnapping] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const btnRef = useRef(null);
    const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
    const livePos = useRef(pos);
    useEffect(() => { livePos.current = pos; }, [pos]);

    // Re-snap on resize
    useEffect(() => {
        const handler = () => {
            setPos((p) => {
                const snap = nearestSnap(p.x, p.y);
                saveSnap(snap);
                return snap;
            });
        };
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (btnRef.current && !btnRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const onPointerDown = useCallback((e) => {
        if (e.button !== undefined && e.button !== 0) return;
        // Don't intercept clicks inside the dropdown
        const dropdown = btnRef.current?.querySelector('.ws-fab-dropdown');
        if (dropdown && dropdown.contains(e.target)) return;
        e.preventDefault();
        drag.current = {
            active: true,
            moved: false,
            startX: e.clientX,
            startY: e.clientY,
            baseX: livePos.current.x,
            baseY: livePos.current.y,
        };
        btnRef.current?.setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e) => {
        const d = drag.current;
        if (!d.active) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
            d.moved = true;
            setDragging(true);
            setIsOpen(false);
        }
        if (d.moved) {
            setPos({
                id: null,
                x: Math.max(0, Math.min(window.innerWidth - BTN, d.baseX + dx)),
                y: Math.max(0, Math.min(window.innerHeight - BTN, d.baseY + dy)),
            });
        }
    }, []);

    const onPointerUp = useCallback((e) => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;

        if (!d.moved) {
            setIsOpen((o) => !o);
        } else {
            const snap = nearestSnap(livePos.current.x, livePos.current.y);
            saveSnap(snap);
            setSnapping(true);
            setPos(snap);
            setTimeout(() => setSnapping(false), 320);
        }
        setDragging(false);
    }, []);

    if (loading || workspaces.length <= 1) return null;

    // Dropdown direction based on position
    const onRight = pos.x > window.innerWidth / 2;
    const onBottom = pos.y > window.innerHeight * 0.65;

    return (
        <div
            ref={btnRef}
            className={[
                'ws-fab',
                dragging ? 'is-dragging' : '',
                snapping ? 'is-snapping' : '',
                isOpen ? 'is-open' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
        >
            <WorkspaceInitial name={activeWorkspace?.name} />

            {isOpen ? (
                <div className={[
                    'ws-fab-dropdown',
                    onRight ? 'is-left' : 'is-right',
                    onBottom ? 'is-up' : 'is-down',
                ].join(' ')}>
                    <div className="ws-fab-dropdown-header">Workspace</div>
                    <div className="ws-fab-dropdown-list">
                        {workspaces.map((ws) => (
                            <button
                                key={ws.slug}
                                type="button"
                                className={`ws-fab-item${activeWorkspace?.slug === ws.slug ? ' is-active' : ''}`}
                                onClick={() => { switchWorkspace(ws.slug); setIsOpen(false); }}
                            >
                                <span className="ws-fab-item-dot" />
                                <span className="ws-fab-item-label">{ws.name}</span>
                                {activeWorkspace?.slug === ws.slug ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
