(function () {
  'use strict';

  var I18N = JSON.parse(document.getElementById('i18n').textContent);
  var quiz = null;
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
    if (quiz) quiz.labels();
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
    if (p.place === 'quiz' && quiz) p.quiz = quiz.root.dataset.summary;
    window.track('call_click', p);
  });

  /* ---------------- переход на основной сайт ---------------- */
  document.querySelectorAll('[data-site]').forEach(function (a) {
    a.addEventListener('click', function () {
      window.track && window.track('main_site_click', { model: window.MODEL, place: a.getAttribute('data-site') });
    });
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
    document.querySelectorAll('.hero .btn, .quiz .btn, .calc .btn, .final .btn').forEach(function (el) { io.observe(el); });
  }

  /* ---------------- предложение на первом экране ----------------
     Заголовок, платёж и сноска первого экрана считаются по таблице ставок под выбранные условия.
     Источники условий: ссылка из рекламы (смарт-баннер) и кнопки срока на первом экране.
       ?term=12            — рассрочка 0% на 12 мес
       ?down=25            — первый взнос 25%
       ?trim=120           — конкретная комплектация (id из build.py)
       ?mode=credit        — кредит (по умолчанию рассрочка)
     То же можно передать в utm_content / utm_term: term12, down25, trim120, credit. */
  function payment(D, ti, di, m, r) {
    var loan = D.trims[ti].price * (100 - D.downs[di]) / 100;
    return r === 0 ? loan / m : loan * (r / 1200) / (1 - Math.pow(1 + r / 1200, -m));
  }
  function months(dict, n) {
    var few = n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
    return few ? dict.monthsFew : dict.monthsMany;
  }

  function applyOffer(o) {
    if (!calc) return null;
    var D = calc.data;
    var term = o.term || null, down = o.down || null, mode = o.mode || 'inst';
    var trims = D.trims.map(function (_, i) { return i; }).filter(function (i) { return !o.trimId || D.trims[i].id === o.trimId; });
    if (!trims.length) trims = D.trims.map(function (_, i) { return i; });

    var best = null, minDown = null;
    function consider(ti, di, m) {
      var r = D.trims[ti].rates[di][D.terms.indexOf(m)];
      var p = payment(D, ti, di, m, r);
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
      var mm = term || D.terms[D.terms.length - 1];
      trims.forEach(function (ti) {
        D.downs.forEach(function (d, di) { if (!down || d === down) consider(ti, di, mm); });
      });
    }
    if (!best) return null;

    var kind = mode === 'credit' ? 'Credit' : (term ? 'Inst' : 'Down');
    ['ru', 'uz'].forEach(function (l) {
      var dict = I18N[l];
      var vars = {
        model: D.model,
        term: best.term,
        months: months(dict, best.term),
        down: kind === 'Inst' ? minDown : D.downs[best.down],
        trim: D.model.replace(/^BYD\s+/, '') + ' ' + D.trims[best.trim].name,
        rate: String(best.rate).replace('.', ','),
        tail: dict.heroTail
      };
      function fill(key) { return dict[key].replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; }); }
      dict.heroTitle = fill('sTitle' + kind);
      dict.heroSub = fill('sSub' + kind);
      // в сноске — точная комбинация, по которой посчитан платёж
      vars.down = D.downs[best.down];
      dict.heroFoot = fill(kind === 'Credit' ? 'sFootCredit' : 'sFootInst');
    });
    var heroPay = document.querySelector('[data-hero-pay]');
    if (heroPay) heroPay.textContent = fmt(Math.ceil(best.pay / 1000) * 1000);
    document.querySelectorAll('[data-hero-terms] [data-term]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(mode === 'inst' && +b.getAttribute('data-term') === best.term));
    });
    calc.set({ mode: mode, trim: best.trim, down: best.down, term: best.term });
    return { mode: mode, best: best };
  }

  function refreshHero() {
    ['heroTitle', 'heroSub', 'heroFoot'].forEach(function (k) {
      var el = document.querySelector('.hero [data-i18n="' + k + '"]');
      if (el) el.innerHTML = t(k);
    });
  }

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
    var r = applyOffer({ term: term, down: down, trimId: trimId, mode: mode });
    if (r) window.track && window.track('smart_banner', { model: window.MODEL, mode: r.mode, term: r.best.term, down: D.downs[r.best.down] });
  }

  /* ---------------- выбор срока на первом экране ---------------- */
  document.querySelectorAll('[data-hero-terms] [data-term]').forEach(function (b) {
    b.addEventListener('click', function () {
      var m = +b.getAttribute('data-term');
      if (applyOffer({ term: m })) refreshHero();
      window.track && window.track('hero_term', { model: window.MODEL, term: m });
    });
  });

  /* ---------------- квиз «Подберём условия за 30 секунд» ---------------- */
  quiz = (function () {
    var root = document.querySelector('[data-quiz]');
    if (!root || !calc) return null;
    var D = calc.data;
    var ans = {}, step = 1, started = false;
    var bar = root.querySelector('[data-quiz-bar]');
    var out = function (k) { return root.querySelector('[data-q-out="' + k + '"]'); };

    function show(n) {
      step = n;
      root.querySelectorAll('[data-step]').forEach(function (el) { el.hidden = el.getAttribute('data-step') !== String(n); });
      bar.style.width = (n === 'result' ? 100 : (n - 1) / 3 * 100) + '%';
      labels();
    }
    function labels() {
      root.querySelectorAll('[data-quiz-n]').forEach(function (el) { el.textContent = t('quizStep').replace('{n}', el.getAttribute('data-quiz-n')); });
      if (step === 'result') result();
    }

    // подбор: самый короткий срок 0%, который укладывается в бюджет; если нет — кредит в бюджете; иначе — ближайший
    function pick() {
      var di = D.downs.indexOf(ans.down), budget = ans.budget, fit = null, closest = null;
      function opt(ti, m) {
        var r = D.trims[ti].rates[di][D.terms.indexOf(m)];
        return { trim: ti, term: m, rate: r, pay: payment(D, ti, di, m, r) };
      }
      D.trims.forEach(function (_, ti) {
        D.terms.forEach(function (m) {
          var o = opt(ti, m);
          if (!closest || o.pay < closest.pay) closest = o;
          if (o.pay > budget) return;
          // 0% лучше кредита, затем более дешёвая комплектация, затем короче срок
          var better = !fit || (o.rate === 0) > (fit.rate === 0) ||
            ((o.rate === 0) === (fit.rate === 0) && (D.trims[ti].price < D.trims[fit.trim].price ||
              (D.trims[ti].price === D.trims[fit.trim].price && (o.rate === 0 ? o.term < fit.term : o.rate < fit.rate))));
          if (better) fit = o;
        });
      });
      return { o: fit || closest, fits: !!fit, di: di };
    }

    var res = null;
    function result() {
      if (!res) return;
      var o = res.o, tr = D.trims[o.trim];
      out('fit').textContent = res.fits ? '✓ ' + t('quizFits') : t('quizClosest');
      out('fit').classList.toggle('is-ok', res.fits);
      out('trim').innerHTML = D.model + ' ' + tr.name;
      out('pay').textContent = fmt(o.pay);
      out('down').textContent = sum(tr.price * ans.down / 100) + ' (' + ans.down + '%)';
      out('term').textContent = o.term + ' ' + t('mo');
      out('rate').textContent = o.rate === 0 ? '0% · ' + t('noOverpay') : String(o.rate).replace('.', ',') + '%';
      out('after').textContent = ans.when === 'later' ? t('quizCold') : t('quizHot');
      root.dataset.summary = [tr.name, ans.down + '%', o.term + 'm', o.rate + '%', Math.round(o.pay), ans.when].join('|');
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-back')) { show(Math.max(1, step - 1)); return; }
      if (b.hasAttribute('data-restart')) { ans = {}; show(1); return; }
      if (!b.hasAttribute('data-a')) return;
      var a = b.getAttribute('data-a');
      if (!started) { started = true; window.track && window.track('quiz_start', { model: window.MODEL }); }
      if (step === 1) { ans.down = +a; show(2); }
      else if (step === 2) { ans.budget = +a; show(3); }
      else if (step === 3) {
        ans.when = a;
        res = pick();
        show('result');
        calc.set({ mode: res.o.rate === 0 ? 'inst' : 'credit', trim: res.o.trim, down: res.di, term: res.o.term });
        var p = { model: window.MODEL, down: ans.down, budget: ans.budget, when: ans.when, fits: res.fits, term: res.o.term };
        window.track && window.track('quiz_complete', p);
        if (ans.when === 'now') window.track && window.track('quiz_hot', p);
      }
    });

    show(1);
    return { labels: labels, root: root };
  })();

  /* ---------------- вовлечённость: время на странице и глубина прокрутки ----------------
     engaged_15s / 30s / 60s — считается только время, когда вкладка открыта.
     scroll_25 / 50 / 75 / 90 — сколько страницы пролистано. */
  (function () {
    if (!window.track) return;
    var marks = [15, 30, 60], sent = {}, active = 0, last = Date.now();
    setInterval(function () {
      var now = Date.now();
      if (document.visibilityState === 'visible') active += (now - last) / 1000;
      last = now;
      marks.forEach(function (s) {
        if (active >= s && !sent['t' + s]) { sent['t' + s] = 1; window.track('engaged_' + s + 's', { model: window.MODEL }); }
      });
    }, 1000);
    var depths = [25, 50, 75, 90];
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - innerHeight;
      var pct = h > 0 ? scrollY / h * 100 : 100;
      depths.forEach(function (d) {
        if (pct >= d && !sent['s' + d]) { sent['s' + d] = 1; window.track('scroll_' + d, { model: window.MODEL }); }
      });
    }, { passive: true });
  })();

  /* ---------------- старт ---------------- */
  smartBanner();
  var q = new URLSearchParams(location.search).get('lang');
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) {}
  applyLang(q || saved || 'ru', false);
  if (calc) calc.render();
})();
