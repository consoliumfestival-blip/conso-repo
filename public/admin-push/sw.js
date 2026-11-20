self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Consolium update', {
    body: payload.body || 'A new Consolium version is ready.',
    icon: '/brand/consolium-icon-192.png',
    badge: '/brand/consolium-icon-192.png',
    tag: payload.tag || 'consolium-code-release',
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
