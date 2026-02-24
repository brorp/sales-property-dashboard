'use client';

import ProfilePage from '../../src/screens/ProfilePage';
import { ProtectedRoute } from '../../src/components/RouteGuards';

export default function ProfileRoute() {
    return (
        <ProtectedRoute>
            <ProfilePage />
        </ProtectedRoute>
    );
}
