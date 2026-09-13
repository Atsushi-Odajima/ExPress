const CACHE='exw-static-v2';const STATIC=['/logo.svg','/icon-192.png','/icon-512.png','/icon-maskable-512.png','/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method==='GET'&&url.origin===location.origin&&STATIC.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});
