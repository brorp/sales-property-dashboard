import DailyTaskPage from '../../src/screens/DailyTaskPage';
import { RoleRoute } from '../../src/components/RouteGuards';

export default function DailyTasksRoutePage() {
    return (
        <RoleRoute allowedRoles={['sales']}>
            <DailyTaskPage />
        </RoleRoute>
    );
}
