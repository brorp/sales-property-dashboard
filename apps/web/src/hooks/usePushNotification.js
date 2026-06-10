'use client';

import { useEffect, useRef } from 'react';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
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

    const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${params.toString()}`
    );
    await navigator.serviceWorker.ready;
    return registration;
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
    const registeredUserIdRef = useRef(null);

    useEffect(() => {
        if (!user) {
            registeredUserIdRef.current = null;
            return;
        }
        if (!VAPID_KEY || registeredUserIdRef.current === user.id) return;

        let unsubMessage = null;

        async function init() {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    return;
                }

                const messaging = await getFirebaseMessaging();
                if (!messaging) {
                    return;
                }

                const swReg = await registerServiceWorker();

                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: swReg || undefined,
                });

                if (token) {
                    localStorage.setItem(STORAGE_KEY, token);

                    await apiRequest('/api/notifications/fcm-token', {
                        method: 'POST',
                        user,
                        body: { token, deviceLabel: getDeviceLabel() },
                    });

                    registeredUserIdRef.current = user.id;
                }

                unsubMessage = onMessage(messaging, (payload) => {
                    if (onForegroundMessage) {
                        onForegroundMessage(payload);
                    } else {
                        const { title, body, icon } = payload.notification || {};
                        if (title && Notification.permission === 'granted') {
                            try {
                                if ('serviceWorker' in navigator) {
                                    navigator.serviceWorker.ready.then((reg) => {
                                        reg.showNotification(title, {
                                            body: body || '',
                                            icon: icon || undefined,
                                        });
                                    });
                                } else if ('Notification' in window) {
                                    new Notification(title, {
                                        body: body || '',
                                        icon: icon || undefined,
                                    });
                                }
                            } catch (e) {
                            }
                        }
                    }
                });
            } catch (err) {
            }
        }

        void init();

        return () => {
            if (unsubMessage) unsubMessage();
        };
    }, [user?.id]);
}

