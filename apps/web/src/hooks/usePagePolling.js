'use client';

import { useEffect, useRef } from 'react';

export function usePagePolling({ enabled, intervalMs = 3000, run }) {
    const timerRef = useRef(null);
    const inFlightRef = useRef(false);

    useEffect(() => {
        if (!enabled || typeof run !== 'function') {
            return undefined;
        }

        let cancelled = false;

        const scheduleNext = () => {
            if (cancelled) {
                return;
            }
            timerRef.current = window.setTimeout(tick, intervalMs);
        };

        const tick = async () => {
            if (cancelled) {
                return;
            }

            if (document.hidden || inFlightRef.current) {
                scheduleNext();
                return;
            }

            inFlightRef.current = true;
            try {
                await run({ silent: true, source: 'poll' });
            } finally {
                inFlightRef.current = false;
                scheduleNext();
            }
        };

        scheduleNext();

        return () => {
            cancelled = true;
            if (timerRef.current) {
                window.clearTimeout(timerRef.current);
            }
        };
    }, [enabled, intervalMs, run]);
}
