// Service worker for ChatBox — handles installable PWA + branded notifications.
const CACHE_VERSION = 'chatbox-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Allow the page to ask the SW to display a notification.
// On Windows + Chrome PWA, this removes the "Google Chrome" header on the toast.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'show-notification' && data.payload) {
    const { title, body, icon, tag, conversationId } = data.payload;
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icon.svg',
      badge: '/icon.svg',
      tag,
      data: { conversationId },
      requireInteraction: false,
      silent: false,
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data && event.notification.data.conversationId;
  const target = conversationId ? `/chat/${conversationId}` : '/chat';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        try {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        } catch {}
      }
      await self.clients.openWindow(target);
    })(),
  );
});
