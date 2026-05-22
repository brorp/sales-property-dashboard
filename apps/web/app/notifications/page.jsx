'use client';

import { ProtectedRoute } from '../../src/components/RouteGuards';
import NotificationsPage from '../../src/screens/NotificationsPage';

export default function NotificationsRoute() {
    return (
        <ProtectedRoute>
            <NotificationsPage />
        </ProtectedRoute>
    );
}
