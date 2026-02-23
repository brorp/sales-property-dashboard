'use client';

import TeamPage from '../../src/pages/TeamPage';
import { AdminRoute } from '../../src/components/RouteGuards';

export default function TeamRoute() {
    return (
        <AdminRoute>
            <TeamPage />
        </AdminRoute>
    );
}
