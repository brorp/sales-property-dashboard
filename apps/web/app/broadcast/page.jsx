'use client';

import BroadcastPage from '../../src/screens/BroadcastPage';
import { SharedWhatsAppRoute } from '../../src/components/RouteGuards';

export default function BroadcastRoute() {
    return (
        <SharedWhatsAppRoute>
            <BroadcastPage />
        </SharedWhatsAppRoute>
    );
}
