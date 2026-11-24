export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = new URL('./sw.js', window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Service worker registration may be skipped in restricted local previews.
    });
  });
}
