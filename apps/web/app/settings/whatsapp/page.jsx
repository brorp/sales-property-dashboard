'use client';

import SettingsPage from '../../../src/screens/SettingsPage';
import { AdminRoute } from '../../../src/components/RouteGuards';

export default function WhatsAppSettingsRoute() {
    return (
        <AdminRoute>
            <SettingsPage />
        </AdminRoute>
    );
}
