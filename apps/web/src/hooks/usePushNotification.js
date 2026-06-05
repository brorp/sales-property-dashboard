'use client';

import { useEffect, useRef } from 'react';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '../lib/firebase';
import { apiRequest } from '../lib/api';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const STORAGE_KEY = 'fcm_token';

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;

    const params = new URLSearchParams({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    });

    await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${params.toString()}`
    );
    await navigator.serviceWorker.ready;
}

function getDeviceLabel() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Browser';
}

export async function removePushToken(user) {
    try {
        const token = localStorage.getItem(STORAGE_KEY);
        if (!token || !user) return;
        const messaging = await getFirebaseMessaging();
        if (messaging) await deleteToken(messaging);
        await apiRequest('/api/notifications/fcm-token', {
            method: 'DELETE',
            user,
            body: { token },
        });
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // tidak fatal
    }
}

export function usePushNotification({ user, onForegroundMessage } = {}) {
    const registeredRef = useRef(false);

    useEffect(() => {
        if (!user || !VAPID_KEY || registeredRef.current) return;

        let unsub = null;

        async function init() {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') return;

                const messaging = await getFirebaseMessaging();
                if (!messaging) return;

                await registerServiceWorker();

                const token = await getToken(messaging, { vapidKey: VAPID_KEY });
                if (!token) return;

                // Simpan token ke localStorage untuk referensi saat logout
                localStorage.setItem(STORAGE_KEY, token);

                await apiRequest('/api/notifications/fcm-token', {
                    method: 'POST',
                    user,
                    body: { token, deviceLabel: getDeviceLabel() },
                });

                registeredRef.current = true;

                unsub = onMessage(messaging, (payload) => {
                    if (onForegroundMessage) onForegroundMessage(payload);
                });
            } catch {
                // gagal init push notification — tidak fatal
            }
        }

        void init();

        return () => {
            if (unsub) unsub();
        };
    }, [user?.id]);
}
