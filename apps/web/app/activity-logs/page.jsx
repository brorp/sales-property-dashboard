'use client';

import ActivityLogsPage from '../../src/screens/ActivityLogsPage';
import { AdminRoute } from '../../src/components/RouteGuards';

export default function ActivityLogsRoute() {
    return (
        <AdminRoute>
            <ActivityLogsPage />
        </AdminRoute>
    );
}
