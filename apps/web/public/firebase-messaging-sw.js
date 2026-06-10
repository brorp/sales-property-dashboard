importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Baca firebase config dari query param URL service worker
function getConfigFromUrl() {
    try {
        const url = new URL(location.href);
        return {
            apiKey: url.searchParams.get('apiKey') || '',
            authDomain: url.searchParams.get('authDomain') || '',
            projectId: url.searchParams.get('projectId') || '',
            messagingSenderId: url.searchParams.get('messagingSenderId') || '',
            appId: url.searchParams.get('appId') || '',
        };
    } catch {
        return null;
    }
}

const config = getConfigFromUrl();

if (config?.apiKey) {
    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        const { title, body, icon } = payload.notification || {};
        if (!title) {
            return;
        }
        self.registration.showNotification(title, {
            body: body || '',
            icon: icon || undefined,
            data: payload.data || {},
        });
    });

    self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const leadId = event.notification.data?.leadId;
        const url = leadId ? `/leads/${leadId}` : '/';
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
                const existing = list.find((c) => c.url.includes(url));
                if (existing) return existing.focus();
                return clients.openWindow(url);
            })
        );
    });
}
