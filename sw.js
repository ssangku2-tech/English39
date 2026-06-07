const CACHE='one-more-english-v10';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  // API/폰트는 항상 네트워크
  if(url.includes('api.anthropic.com')||url.includes('fonts.g')||url.includes('gstatic.com')||url.includes('firebaseio.com')||url.includes('firebasedatabase.app')){return}
  // 매일 갱신되는 콘텐츠는 네트워크 우선(실패 시 캐시)
  if(url.includes('/content/')){
    e.respondWith(
      fetch(e.request).then(resp=>{
        if(resp.ok){const cl=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cl))}
        return resp;
      }).catch(()=>caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      if(e.request.method==='GET'&&resp.ok){
        const cl=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,cl));
      }
      return resp;
    }).catch(()=>caches.match('./index.html')))
  );
});
