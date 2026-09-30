// 앱 설치용 서비스 워커
// 사설은 항상 최신이어야 하므로 아무것도 저장(캐시)하지 않고, 요청을 그대로 인터넷으로 보냅니다.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
