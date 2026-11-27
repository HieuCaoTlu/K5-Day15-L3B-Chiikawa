/* Thông báo của Planning trên đúng origin của Tầng. Chỉ mở đường dẫn trong Planning. */
const ALLOWED = /^\/planning(\?task=[1-9][0-9]*)?$/;

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload || typeof payload.url !== 'string' || !ALLOWED.test(payload.url)) return;
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (typeof url === 'string' && ALLOWED.test(url)) {
    event.waitUntil(self.clients.openWindow(url));
  }
});
