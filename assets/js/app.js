(function () {
  'use strict';

  var I18N = JSON.parse(document.getElementById('i18n').textContent);
  var lang = 'ru';

  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || ''; }
  function fmt(n) { return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function sum(n) { return fmt(n) + ' ' + t('sum'); }

  /* ---------------- язык ---------------- */
  function applyLang(next, push) {
    lang = next === 'uz' ? 'uz' : 'ru';
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      el.setAttribute('content', t(el.getAttribute('data-i18n-content')).replace(/<[^>]+>/g, ''));
    });
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
    try { localStorage.setItem('lang', lang); } catch (e) {}
    if (push) {
      var u = new URL(location.href);
      if (lang === 'uz') u.searchParams.set('lang', 'uz'); else u.searchParams.delete('lang');
      history.replaceState(null, '', u);
    }
    if (calc) calc.render();
  }

  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      applyLang(b.getAttribute('data-lang'), true);
      window.track && window.track('lang_switch', { lang: lang });
    });
  });

  /* ---------------- калькулятор ---------------- */
  var calc = (function () {
    var root = document.querySelector('[data-calc]');
    if (!root) return null;
    var D = JSON.parse(root.querySelector('[data-calc-data]').textContent);
    var st = { mode: 'inst', trim: 0, down: D.downs.indexOf(50), term: null };
    if (st.down < 0) st.down = 0;
    var $ = function (s) { return root.querySelector(s); };
    var out = function (k) { return root.querySelector('[data-out="' + k + '"]'); };

    function rate(trim, d, termIdx) { return D.trims[trim].rates[d][termIdx]; }
    function zeroTerms(trim, d) {
      return D.terms.filter(function (_, i) { return rate(trim, d, i) === 0; });
    }
    function available() {
      return st.mode === 'inst' ? zeroTerms(st.trim, st.down) : D.terms.slice();
    }
    function fixTerm() {
      var av = available();
      if (av.indexOf(st.term) === -1) st.term = av[av.length - 1];
    }

    function button(label, pressed, onClick, disabled, sub) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pressed));
      b.innerHTML = label + (sub ? '<small>' + sub + '</small>' : '');
      if (disabled) b.disabled = true;
      b.addEventListener('click', onClick);
      return b;
    }

    function render() {
      fixTerm();
      root.querySelectorAll('[data-mode]').forEach(function (b) {
        b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === st.mode));
      });

      var trims = $('[data-trims]'); trims.innerHTML = '';
      D.trims.forEach(function (tr, i) {
        trims.appendChild(button(tr.name, i === st.trim, function () { st.trim = i; changed(); }, false, sum(tr.price)));
      });

      var downs = $('[data-downs]'); downs.innerHTML = '';
      D.downs.forEach(function (d, i) {
        downs.appendChild(button(d + '%', i === st.down, function () { st.down = i; changed(); }));
      });

      var av = available();
      var terms = $('[data-terms]'); terms.innerHTML = '';
      D.terms.forEach(function (m) {
        var ok = av.indexOf(m) !== -1;
        terms.appendChild(button(String(m), m === st.term, function () { st.term = m; changed(); }, !ok));
      });

      var tr = D.trims[st.trim];
      var price = tr.price;
      var downPct = D.downs[st.down];
      var downSum = price * downPct / 100;
      var loan = price - downSum;
      var ti = D.terms.indexOf(st.term);
      var r = rate(st.trim, st.down, ti);
      var pay = r === 0 ? loan / st.term : loan * (r / 1200) / (1 - Math.pow(1 + r / 1200, -st.term));

      out('pay').textContent = fmt(pay);
      out('down').textContent = sum(downSum) + ' (' + downPct + '%)';
      out('loan').textContent = sum(loan);
      out('rate').textContent = String(r).replace('.', ',') + '%';
      out('over').textContent = sum(pay * st.term - loan);
      out('banks').textContent = tr.banks.join(', ');
      out('badge').textContent = r === 0 ? '0% · ' + t('noOverpay') : '';
      root.querySelectorAll('[data-credit-only]').forEach(function (el) { el.hidden = r === 0; });

      // подсказка: как получить более длинную рассрочку
      var hint = '';
      if (st.mode === 'inst') {
        var cur = Math.max.apply(null, zeroTerms(st.trim, st.down));
        for (var i = st.down + 1; i < D.downs.length; i++) {
          var mx = Math.max.apply(null, zeroTerms(st.trim, i));
          if (mx > cur) { hint = t('hintUp').replace('{p}', D.downs[i]).replace('{m}', mx); break; }
        }
        if (!hint) hint = t('hintMax').replace('{m}', cur);
      }
      $('[data-hint]').textContent = hint;

      // контекст расчёта — уходит в аналитику при звонке из калькулятора
      root.dataset.summary = [tr.name, st.mode, downPct + '%', st.term + 'm', r + '%', Math.round(pay)].join('|');
    }

    var touched = false;
    function changed() {
      render();
      if (!touched) { touched = true; window.track && window.track('calc_used', { model: window.MODEL }); }
    }

    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { st.mode = b.getAttribute('data-mode'); changed(); });
    });

    function set(o) { Object.assign(st, o); render(); }

    return { render: render, root: root, set: set, data: D };
  })();

  /* ---------------- звонки ---------------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a || !window.track) return;
    var p = { model: window.MODEL, place: a.getAttribute('data-call') || 'link', lang: lang };
    if (p.place === 'calc' && calc) p.calc = calc.root.dataset.summary;
    window.track('call_click', p);
  });

  /* ---------------- видео (грузится только по клику) ---------------- */
  document.querySelectorAll('[data-yt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.getAttribute('data-yt')) + '?autoplay=1&rel=0';
      f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      f.title = b.getAttribute('aria-label') || 'YouTube';
      b.replaceWith(f);
      window.track && window.track('video_play', { model: window.MODEL, id: b.getAttribute('data-yt') });
    });
  });

  /* ---------------- sticky-кнопка: прячем, когда видна другая кнопка звонка ---------------- */
  var sticky = document.querySelector('.sticky');
  if (sticky && 'IntersectionObserver' in window) {
    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.isIntersecting ? visible.add(en.target) : visible.delete(en.target); });
      sticky.classList.toggle('is-hidden', visible.size > 0);
    }, { threshold: 0.5 });
    document.querySelectorAll('.hero .btn, .calc .btn, .final .btn').forEach(function (el) { io.observe(el); });
  }

  /* ---------------- смарт-баннер ----------------
     Текст первого экрана и калькулятор подстраиваются под ссылку из рекламы:
       ?term=12            — рассрочка 0% на 12 мес
       ?down=25            — первый взнос 25%
       ?trim=120           — конкретная комплектация (id из build.py)
       ?mode=credit        — кредит (по умолчанию рассрочка)
     То же можно передать в utm_content / utm_term: term12, down25, trim120, credit. */
  function smartBanner() {
    if (!calc) return;
    var D = calc.data;
    var q = new URLSearchParams(location.search);
    var tokens = [q.get('utm_content'), q.get('utm_term'), q.get('offer')].join(' ').toLowerCase();
    function pick(name, re) {
      var v = q.get(name);
      if (v) return v.toLowerCase();
      var m = tokens.match(re);
      return m ? m[1] : null;
    }
    var term = parseInt(pick('term', /term[-_]?(\d+)/), 10);
    var down = parseInt(pick('down', /down[-_]?(\d+)/), 10);
    var trimId = pick('trim', /trim[-_]?([a-z0-9]+)/);
    var mode = (q.get('mode') || '').toLowerCase() === 'credit' || /(^|[^a-z])(credit|kredit)/.test(tokens) ? 'credit' : 'inst';
    if (D.terms.indexOf(term) === -1) term = null;
    if (D.downs.indexOf(down) === -1) down = null;
    if (!term && !down && !trimId && mode === 'inst') return;

    var trims = D.trims.map(function (_, i) { return i; }).filter(function (i) { return !trimId || D.trims[i].id === trimId; });
    if (!trims.length) trims = D.trims.map(function (_, i) { return i; });

    function payment(ti, di, m, r) {
      var loan = D.trims[ti].price * (100 - D.downs[di]) / 100;
      return r === 0 ? loan / m : loan * (r / 1200) / (1 - Math.pow(1 + r / 1200, -m));
    }
    var best = null, minDown = null;
    function consider(ti, di, m) {
      var r = D.trims[ti].rates[di][D.terms.indexOf(m)];
      var p = payment(ti, di, m, r);
      if (!best || p < best.pay) best = { trim: ti, down: di, term: m, rate: r, pay: p };
      if (minDown === null || D.downs[di] < minDown) minDown = D.downs[di];
    }

    if (mode === 'inst') {
      trims.forEach(function (ti) {
        D.downs.forEach(function (d, di) {
          if (down && d !== down) return;
          var zt = D.terms.filter(function (_, mi) { return D.trims[ti].rates[di][mi] === 0; });
          if (!zt.length) return;
          var m = term ? (zt.indexOf(term) !== -1 ? term : null) : Math.max.apply(null, zt);
          if (m) consider(ti, di, m);
        });
      });
      if (!best) mode = 'credit'; // на такой срок 0% нет — показываем честный кредит
    }
    if (mode === 'credit') {
      best = null; minDown = null;
      var m = term || D.terms[D.terms.length - 1];
      trims.forEach(function (ti) {
        D.downs.forEach(function (d, di) { if (!down || d === down) consider(ti, di, m); });
      });
    }
    if (!best) return;

    var kind = mode === 'credit' ? 'Credit' : (term ? 'Inst' : 'Down');
    ['ru', 'uz'].forEach(function (l) {
      var dict = I18N[l];
      var few = best.term % 10 >= 2 && best.term % 10 <= 4 && !(best.term % 100 >= 12 && best.term % 100 <= 14);
      var vars = {
        model: D.model,
        term: best.term,
        months: few ? dict.monthsFew : dict.monthsMany,
        down: kind === 'Inst' ? minDown : D.downs[best.down],
        trim: D.model.replace(/^BYD\s+/, '') + ' ' + D.trims[best.trim].name,
        rate: String(best.rate).replace('.', ','),
        tail: dict.heroTail
      };
      function fill(key) { return dict[key].replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; }); }
      dict.heroTitle = fill('sTitle' + kind);
      dict.heroSub = fill('sSub' + (kind === 'Down' ? 'Down' : kind));
      // в сноске — точная комбинация, по которой посчитан платёж
      vars.down = D.downs[best.down];
      dict.heroFoot = fill(kind === 'Credit' ? 'sFootCredit' : 'sFootInst');
    });
    var heroPay = document.querySelector('[data-hero-pay]');
    if (heroPay) heroPay.textContent = fmt(Math.ceil(best.pay / 1000) * 1000);
    calc.set({ mode: mode, trim: best.trim, down: best.down, term: best.term });
    window.track && window.track('smart_banner', { model: window.MODEL, mode: mode, term: best.term, down: D.downs[best.down] });
  }

  /* ---------------- старт ---------------- */
  smartBanner();
  var q = new URLSearchParams(location.search).get('lang');
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) {}
  applyLang(q || saved || 'ru', false);
  if (calc) calc.render();
})();
