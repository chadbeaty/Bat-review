/* Gapper landing page. Draws the outfield behind the hero and plays Gapper's tracked view of a real swing (the 33
   body points from the analyzer, run on the sample clip; assets/pose.json). In the hero it builds up as a strobe:
   a ghost flashes on at each moment of the swing and the hands' path burns in as a lime light trail. The sample
   read plays the same swing next to what Gapper concluded about it. Sections fade in. */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  // A hitter set up on this device before the site existed has no cookie yet. If the app's database already holds
  // one, hand them to /start, which sets the cookie and sends them on to their app. Opening without a version never
  // creates the database: an upgrade means it did not exist, so that transaction is aborted.
  try {
    var req = indexedDB.open('swingiq');
    req.onupgradeneeded = function () { req.transaction.abort(); };
    req.onsuccess = function () {
      var idb = req.result;
      if (!idb.objectStoreNames.contains('players')) { idb.close(); return; }
      var n = idb.transaction('players', 'readonly').objectStore('players').count();
      n.onsuccess = function () { idb.close(); if (n.result > 0) location.replace('/start'); };
      n.onerror = function () { idb.close(); };
    };
    req.onerror = function (e) { if (e.preventDefault) e.preventDefault(); };
  } catch { /* storage blocked: stay on the site */ }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) document.documentElement.classList.add('reduce');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var LIME = '#c4f135', WHITE = '#ffffff', STEEL = '#8d939a';

  // In-page links glide (unless motion is reduced), and land under the sticky bar.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var el = document.getElementById(a.getAttribute('href').slice(1));
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', a.getAttribute('href'));
  });

  // ---------------------------------------------------------------- reveals
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // ---------------------------------------------------------------- the outfield (hero), 400 x 440 units
  var HOME = [190, 470], R_IN = 235, R_OUT = 305, GAP = 10, BREAK = 34;
  var RAYS = [247.5, 270, 292.5];
  var rad = function (d) { return d * Math.PI / 180; };
  function lineCircle(p, u, r) {
    var dx = p[0] - HOME[0], dy = p[1] - HOME[1], b = dx * u[0] + dy * u[1], c = dx * dx + dy * dy - r * r;
    var t = -b + Math.sqrt(Math.max(0, b * b - c));
    return [p[0] + u[0] * t, p[1] + u[1] * t];
  }
  function edge(ray, w, side, r) {
    var u = [Math.cos(rad(ray)), Math.sin(rad(ray))], n = [-u[1], u[0]];
    return lineCircle([HOME[0] + n[0] * side * w / 2, HOME[1] + n[1] * side * w / 2], u, r);
  }
  function onCircle(r, a) { return [HOME[0] + r * Math.cos(rad(a)), HOME[1] + r * Math.sin(rad(a))]; }
  var fmt = function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); };
  var field = document.getElementById('outfield');
  if (field) {
    var svg = field.ownerSVGElement;
    svg.setAttribute('viewBox', '0 0 400 440');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.style.height = '100%';
    var widths = [BREAK, GAP, GAP], d = '';
    for (var i = 0; i < 4; i++) {
      var oL = i === 0 ? onCircle(R_OUT, 225) : edge(RAYS[i - 1], widths[i - 1], 1, R_OUT);
      var iL = i === 0 ? onCircle(R_IN, 225) : edge(RAYS[i - 1], widths[i - 1], 1, R_IN);
      var oR = i === 3 ? onCircle(R_OUT, 315) : edge(RAYS[i], widths[i], -1, R_OUT);
      var iR = i === 3 ? onCircle(R_IN, 315) : edge(RAYS[i], widths[i], -1, R_IN);
      d += 'M' + fmt(oL) + 'A' + R_OUT + ' ' + R_OUT + ' 0 0 1 ' + fmt(oR) + 'L' + fmt(iR) + 'A' + R_IN + ' ' + R_IN + ' 0 0 0 ' + fmt(iL) + 'Z';
    }
    field.innerHTML =
      '<path d="' + d + '" fill="url(#blk)"/>' +
      '<path d="' + d + '" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>' +
      // the foul lines, faint chalk
      '<path d="M' + HOME[0] + ' ' + HOME[1] + ' L' + fmt(onCircle(R_OUT + 30, 225)) + ' M' + HOME[0] + ' ' + HOME[1] + ' L' + fmt(onCircle(R_OUT + 30, 315)) + '" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>';
  }

  // The small outfield in the "three gaps" fact: the same four blocks, the ball out through left-center.
  var mini = document.querySelector('[data-mini-field]');
  if (mini && field) {
    var ball = onCircle((R_IN + R_OUT) / 2, RAYS[0]);
    mini.setAttribute('viewBox', '-30 150 460 200');
    mini.innerHTML = '<path d="' + field.querySelector('path').getAttribute('d') + '" fill="#202328" stroke="#ffffff" stroke-opacity="0.08"/>' +
      '<path d="M' + HOME[0] + ' ' + (HOME[1] - 120) + ' L' + fmt(ball) + '" stroke="#c4f135" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>' +
      '<circle cx="' + ball[0].toFixed(1) + '" cy="' + ball[1].toFixed(1) + '" r="13" fill="#c4f135"/>';
  }

  // The Gapper Score gauge in the sample read: the logo's outfield as four blocks, lit lime up to the score.
  [].slice.call(document.querySelectorAll('svg[data-gauge]')).forEach(function (g) {
    var v = Number(g.getAttribute('data-gauge')), cx = 100, cy = 110, rI = 62, rO = 88, a0 = 198, a1 = 342, gap = 4;
    var span = (a1 - a0 - gap * 3) / 4, at = a0 + (a1 - a0) * v / 100;
    var P = function (r, d) { return (cx + r * Math.cos(rad(d))).toFixed(1) + ' ' + (cy + r * Math.sin(rad(d))).toFixed(1); };
    var blk = function (f, t) { return 'M' + P(rO, f) + 'A' + rO + ' ' + rO + ' 0 0 1 ' + P(rO, t) + 'L' + P(rI, t) + 'A' + rI + ' ' + rI + ' 0 0 0 ' + P(rI, f) + 'Z'; };
    var out = '';
    for (var i = 0; i < 4; i++) {
      var f0 = a0 + i * (span + gap), t0 = f0 + span;
      out += '<path d="' + blk(f0, t0) + '" fill="#23262b"/>';
      if (at > f0) out += '<path d="' + blk(f0, Math.min(t0, at)) + '" fill="#c4f135"/>';
    }
    var b = P((rI + rO) / 2, at).split(' ');
    out += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="7" fill="#c4f135" stroke="#0b0c0e" stroke-width="3"/>';
    g.innerHTML = out;
  });

  // ---------------------------------------------------------------- the tracked swing
  var FRONT = { 23: 1, 25: 1, 27: 1, 29: 1, 31: 1 }; // right-handed hitter: the left leg leads
  var BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [15, 17], [15, 19], [17, 19],
    [16, 18], [16, 20], [18, 20], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31]];
  var JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  var POSE = null;
  var canvases = [].slice.call(document.querySelectorAll('canvas[data-swing]')).map(function (c) {
    return { el: c, kind: c.getAttribute('data-swing'), ctx: c.getContext('2d'), w: 0, h: 0, visible: true };
  });

  function size(c) {
    var r = c.el.getBoundingClientRect();
    c.w = r.width; c.h = r.height;
    c.el.width = Math.max(1, Math.round(r.width * DPR)); c.el.height = Math.max(1, Math.round(r.height * DPR));
  }

  // Where the real tracked hitter stands on the small read canvas: pose units (0..1 of a 4:5 frame) to pixels.
  function mapper(c) {
    // The hero shows the whole hitter with room around them. On the small read canvas the hitter stands in the
    // illustrated batter's box (feet on the box, home plate in front of him at lower left, the way he faces).
    var hero = c.kind === 'hero', s = c.h / (hero ? 0.8 : 0.8), floor = hero ? 0.86 : 0.72;
    return function (p) { return [c.w / 2 + (p[0] - 0.51) * 0.8 * s, c.h * floor + (p[1] - 0.87) * s]; };
  }

  function lerpFrame(t) {
    var f = POSE.frames, i = Math.floor(t), u = t - i, a = f[i], b = f[Math.min(f.length - 1, i + 1)];
    if (!a) return null;
    if (!b) return a;
    return a.map(function (p, j) { var q = b[j]; return p && q ? [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, Math.min(p[2], q[2])] : p; });
  }

  // Loop: stance to finish, a beat held at contact. Frame numbers are the clip's own (25 per second of footage).
  var F0 = 62, F1 = 160, HOLD = 0.7, FPS = 26;
  var FOOT = 108, CONTACT = 114;
  function frameAt(sec) {
    var span = (F1 - F0) / FPS, total = span + HOLD, s = sec % total, beforeContact = (CONTACT - F0) / FPS;
    if (s < beforeContact) return F0 + s * FPS;
    if (s < beforeContact + HOLD) return CONTACT;
    return CONTACT + (s - beforeContact - HOLD) * FPS;
  }

  // The strobe: a ghost flashes on at each of these frames as the swing passes it (the last is the heel landing).
  var GHOSTS = [72, 86, 98, FOOT];
  function bones(ctx, fr, m, L, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    BONES.forEach(function (bn) {
      var a = fr[bn[0]], b = fr[bn[1]];
      if (!a || !b || a[2] < 0.3 || b[2] < 0.3) return;
      var pa = m(a), pb = m(b);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    });
    var nose = fr[0];
    if (nose && nose[2] > 0.3) { var pn = m(nose); ctx.beginPath(); ctx.arc(pn[0], pn[1], L * 6, 0, Math.PI * 2); ctx.stroke(); }
  }
  function grip(fr) {
    var a = fr[15], b = fr[16];
    return a && b && a[2] > 0.3 && b[2] > 0.3 ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  }
  function strobe(c, f, m, L) {
    var ctx = c.ctx;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    GHOSTS.forEach(function (g, i) {
      if (f < g || !POSE.frames[g]) return;
      var age = Math.min(1, (f - g) / 3);
      var a = (0.14 + 0.1 * i) + (1 - age) * 0.5; // flash bright, then settle as a ghost
      bones(ctx, POSE.frames[g], m, L, 'rgba(214,220,226,' + a.toFixed(3) + ')', L * 1.4);
    });
    // The hands' path, from the start of the loop to now (up to just past contact), as a lime light trail.
    var end = Math.min(f, CONTACT + 8), pts = [];
    for (var k = F0; k <= end; k++) { var q = POSE.frames[k] && grip(POSE.frames[k]); if (q) pts.push(m(q)); }
    if (pts.length > 1) {
      ctx.save();
      ctx.shadowColor = 'rgba(196,241,53,0.7)'; ctx.shadowBlur = L * 5;
      ctx.strokeStyle = LIME; ctx.lineWidth = L * 2.2;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var n = 1; n < pts.length; n++) ctx.lineTo(pts[n][0], pts[n][1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  // The HUD over the hero: where the swing is, counted in frames from contact (the clip is slow motion of unknown
  // speed, so frames, not seconds).
  var hudPhase = document.querySelector('[data-hud-phase]'), hudMs = document.querySelector('[data-hud-ms]'), hudDot = document.querySelector('[data-hud-dot]');
  var lastHud = '';
  function hud(f) {
    if (!hudPhase) return;
    var phase = f < FOOT ? 'Loading' : f < CONTACT ? 'Heel down' : f < CONTACT + 3 ? 'Contact' : 'Finish';
    var d = Math.round(f - CONTACT), txt = phase + '|' + d;
    if (txt === lastHud) return;
    lastHud = txt;
    hudPhase.textContent = phase;
    hudMs.textContent = (d > 0 ? '+' : d < 0 ? '\u2212' : '') + Math.abs(d) + ' fr';
    hudDot.className = 'dot ' + (phase === 'Contact' || phase === 'Heel down' ? 'dot-lime' : 'dot-white');
  }

  function draw(c, f) {
    var ctx = c.ctx, fr = lerpFrame(f);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, c.w, c.h);
    if (!fr) return;
    var m = mapper(c), L = Math.max(1.4, Math.min(c.w, c.h) / 140);
    if (c.kind === 'hero') { strobe(c, f, m, L); hud(f); }
    var P = function (j) { var p = fr[j]; return p && p[2] > 0.3 ? m(p) : null; };

    // Bones: white body, lime front leg.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    BONES.forEach(function (bn) {
      var a = P(bn[0]), b = P(bn[1]);
      if (!a || !b) return;
      var front = FRONT[bn[0]] && FRONT[bn[1]];
      ctx.strokeStyle = front ? LIME : 'rgba(255,255,255,0.92)';
      ctx.lineWidth = (front ? L * 2.3 : L * 1.6) * (c.kind === 'hero' ? 0.8 : 1);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    // Head as a ring around the nose and ears.
    var nose = P(0), e1 = P(7), e2 = P(8);
    if (nose) {
      var hr = e1 && e2 ? Math.hypot(e1[0] - e2[0], e1[1] - e2[1]) * 0.75 : L * 8;
      ctx.strokeStyle = WHITE; ctx.lineWidth = L * 1.6;
      ctx.beginPath(); ctx.arc(nose[0], nose[1], Math.max(hr, L * 5), 0, Math.PI * 2); ctx.stroke();
    }
    JOINTS.forEach(function (j) {
      var p = P(j); if (!p) return;
      ctx.fillStyle = FRONT[j] ? LIME : WHITE;
      ctx.beginPath(); ctx.arc(p[0], p[1], FRONT[j] ? L * 1.9 : L * 1.4, 0, Math.PI * 2); ctx.fill();
    });
    // Heel strike: a ring on the front heel from the frame it lands.
    if (f >= FOOT) {
      var heel = m(POSE.frames[FOOT][29]), age = Math.min(1, (f - FOOT) / 6);
      ctx.strokeStyle = 'rgba(196,241,53,' + (0.9 - age * 0.4) + ')'; ctx.lineWidth = L * 1.4;
      ctx.beginPath(); ctx.arc(heel[0], heel[1], L * (5 + age * 5), 0, Math.PI * 2); ctx.stroke();
    }
    // Ground line.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    var foot = m([0.5, 0.875]);
    ctx.beginPath(); ctx.moveTo(8, foot[1]); ctx.lineTo(c.w - 8, foot[1]); ctx.stroke();
    if (c.kind !== 'hero') label(c, f);
  }



  // On the small read canvas: the frame clock between heel down and contact.
  function label(c, f) {
    var ctx = c.ctx, txt;
    if (f < FOOT) txt = 'Loading';
    else if (f < CONTACT) txt = 'Heel down · frame ' + Math.floor(f - FOOT + 1) + ' of 6';
    else if (f < CONTACT + 0.5) txt = 'Contact · 6 frames';
    else txt = 'Finish';
    ctx.font = '700 12px Chivo, sans-serif';
    ctx.fillStyle = f >= FOOT && f < CONTACT + 0.5 ? LIME : STEEL;
    ctx.fillText(txt, 10, 20);
  }

  function frameStill() { return reduce ? CONTACT : null; }

  var t0 = performance.now(), raf = 0;
  function loop(now) {
    var sec = (now - t0) / 1000, f = frameStill() || frameAt(sec);
    canvases.forEach(function (c) {
      if (!c.visible) return;
      if (POSE) draw(c, c.kind === 'hero' ? f : frameAt(sec + 1.3));
    });
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  function start() {
    canvases.forEach(size);
    if ('IntersectionObserver' in window) {
      var vis = new IntersectionObserver(function (es) {
        es.forEach(function (e) { canvases.forEach(function (c) { if (c.el === e.target) c.visible = e.isIntersecting; }); });
      });
      canvases.forEach(function (c) { vis.observe(c.el); });
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  start();
  var rt;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { canvases.forEach(size); if (reduce) loop(performance.now()); }, 120); });
  // The real tracked swing for the sample read.
  fetch('/site/assets/pose.json').then(function (r) { return r.json(); }).then(function (p) {
    POSE = p;
    if (reduce) loop(performance.now());
  }).catch(function () { /* no figure: the page still reads */ });
})();
