'use client';

import SettingsPage from '../../../src/screens/SettingsPage';
import { SharedWhatsAppRoute } from '../../../src/components/RouteGuards';

export default function WhatsAppSettingsRoute() {
    return (
        <SharedWhatsAppRoute>
            <SettingsPage />
        </SharedWhatsAppRoute>
    );
}
