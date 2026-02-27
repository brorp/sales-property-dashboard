'use client';

import BroadcastPage from '../../src/screens/BroadcastPage';
import { AdminRoute } from '../../src/components/RouteGuards';

export default function BroadcastRoute() {
    return (
        <AdminRoute>
            <BroadcastPage />
        </AdminRoute>
    );
}
