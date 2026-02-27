import { redirect } from 'next/navigation';

export default function ProfileRouteRedirect() {
    redirect('/settings');
}
