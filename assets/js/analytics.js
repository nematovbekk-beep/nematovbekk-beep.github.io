/* Подключает счётчики по ID из window.SITE и даёт window.track(event, params).
   Клик по любой tel:-ссылке отправляет событие "call_click" во все подключённые системы. */
(function () {
  var S = window.SITE || {};
  window.dataLayer = window.dataLayer || [];

  function load(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  if (S.gtm_id) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    load('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(S.gtm_id));
  } else if (S.ga4_id) {
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', S.ga4_id);
    load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(S.ga4_id));
  }

  if (S.fb_pixel_id) {
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    load('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', S.fb_pixel_id);
    window.fbq('track', 'PageView');
  }

  if (S.ym_id) {
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    load('https://mc.yandex.ru/metrika/tag.js');
    window.ym(S.ym_id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }

  window.track = function (event, params) {
    params = params || {};
    try {
      window.dataLayer.push(Object.assign({ event: event }, params));
      if (window.gtag && !S.gtm_id) window.gtag('event', event, params);
      if (window.fbq && event === 'call_click') window.fbq('track', 'Contact', params);
      if (window.ym && S.ym_id) window.ym(S.ym_id, 'reachGoal', event, params);
    } catch (e) { /* аналитика не должна ломать страницу */ }
  };
})();
