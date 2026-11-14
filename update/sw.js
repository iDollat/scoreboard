// Stara wersja beta – ten service worker tylko sprząta po sobie i się wyrejestrowuje.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  const prefix = 'scoreboard:' + self.registration.scope + ':';
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(prefix)).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
