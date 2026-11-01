/**
 * Регистрация Service Worker для PWA и оффлайн-режима
 */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Поддержка запуска на GitHub Pages с подкаталогами
      const swPath = './sw.js';
      navigator.serviceWorker.register(swPath)
        .then((reg) => {
          console.log('[PWA] Service Worker успешно зарегистрирован:', reg.scope);
          
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] Доступна новая версия игры!');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Ошибка регистрации Service Worker:', err);
        });
    });
  }
}
