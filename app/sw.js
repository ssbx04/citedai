// Met en cache la coquille de l'application et le corpus. Les modèles, eux,
// sont déjà mis en cache par transformers.js dans le Cache API du navigateur.

const VERSION = 'preuve-2';
const COQUILLE = ['./', './index.html', './styles.css', './app.js', './travailleur.js',
                  './bm25.js', './porter.js',
                  './biblio/transformers.js',
                  './biblio/ort-wasm-simd-threaded.jsep.mjs',
                  './biblio/ort-wasm-simd-threaded.jsep.wasm',
                  './donnees/corpus.json', './donnees/reglages.json'];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(COQUILLE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  evenement.respondWith(
    caches.match(requete).then((enCache) => enCache || fetch(requete)),
  );
});
