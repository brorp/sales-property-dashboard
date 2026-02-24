'use client';

import SettingsPage from '../../src/screens/SettingsPage';
import { AdminRoute } from '../../src/components/RouteGuards';

export default function SettingsRoute() {
    return (
        <AdminRoute>
            <SettingsPage />
        </AdminRoute>
    );
}
