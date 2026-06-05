import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
    if (!firebaseConfig.apiKey) return null;
    return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export async function getFirebaseMessaging() {
    const supported = await isSupported();
    if (!supported) return null;
    const app = getFirebaseApp();
    if (!app) return null;
    return getMessaging(app);
}
