/* Gapper landing page. Draws the outfield behind the hero and an illustrated slow-pitch swing in Gapper's tracked
   style (labelled as an illustration on the page), plays the real tracked swing from the sample clip in the sample
   read (the 33 body points from the analyzer; assets/pose.json), and fades sections in. */
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
    var s = c.h / 0.62;
    return function (p) { return [c.w / 2 + (p[0] - 0.51) * 0.8 * s, c.h * 0.94 + (p[1] - 0.87) * s]; };
  }
  function world(c) {
    var k = Math.max(c.w / 400, c.h / 440), ox = (c.w - 400 * k) / 2, oy = (c.h - 440 * k) / 2;
    return function (x, y) { return [ox + x * k, oy + y * k]; };
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

  function draw(c, f) {
    var ctx = c.ctx, fr = lerpFrame(f);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, c.w, c.h);
    if (!fr) return;
    var m = mapper(c), L = Math.max(1.4, Math.min(c.w, c.h) / 140);
    var P = function (j) { var p = fr[j]; return p && p[2] > 0.3 ? m(p) : null; };

    // Bones: white body, lime front leg.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    BONES.forEach(function (bn) {
      var a = P(bn[0]), b = P(bn[1]);
      if (!a || !b) return;
      var front = FRONT[bn[0]] && FRONT[bn[1]];
      ctx.strokeStyle = front ? LIME : 'rgba(255,255,255,0.92)';
      ctx.lineWidth = front ? L * 2.3 : L * 1.6;
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
    if (c.kind === 'read') label(c, f);
  }


  // ---------------------------------------------------------------- the hero hitter (illustration)
  // A slow-pitch hitter drawn the way Gapper sees one (tracked points and bones, front leg in lime), seen from the
  // side and facing the pitcher on the left, so the bat reads clearly. Timing follows the slow-pitch swing: the pitch
  // is in the air about 1.5 s, the hitter steps as the ball peaks, plants the front heel about 0.25 s before contact,
  // meets it out in front of the front hip, and the line drive goes back out through the left-center gap.
  // Coordinates are the hero's 400 x 440 world (ground at y = 402).
  var KEYS = [
    { t: 0.00, bat: [-68.6, 110], j: { hd: [286, 170], fs: [262, 206], bs: [292, 210], fe: [282, 232], be: [322, 214], h: [302, 194], fh: [272, 286], bh: [292, 288], fk: [254, 342], bk: [306, 340], fa: [244, 394], ba: [322, 394], ft: [228, 402], fl: [248, 402], bt: [306, 402], bl: [326, 402] } },
    { t: 0.55, bat: [-68.6, 110], j: null },
    { t: 1.10, bat: [-66, 110], j: { hd: [290, 172], fs: [266, 208], bs: [296, 212], fe: [288, 236], be: [328, 218], h: [312, 198], fh: [276, 288], bh: [296, 290], fk: [258, 340], bk: [310, 342], fa: [246, 390], ba: [324, 394], ft: [230, 400], fl: [250, 396], bt: [308, 402], bl: [328, 402] } },
    { t: 1.70, bat: [-62, 110], j: { hd: [282, 176], fs: [258, 212], bs: [290, 214], fe: [282, 238], be: [324, 222], h: [308, 204], fh: [262, 290], bh: [288, 292], fk: [230, 344], bk: [304, 346], fa: [208, 394], ba: [326, 394], ft: [192, 402], fl: [212, 402], bt: [310, 402], bl: [330, 402] } },
    { t: 1.84, bat: [-15, 104], j: { hd: [278, 178], fs: [254, 212], bs: [282, 218], fe: [266, 236], be: [298, 250], h: [276, 240], fh: [254, 290], bh: [280, 294], fk: [222, 346], bk: [294, 350], fa: [208, 394], ba: [322, 392], ft: [192, 402], fl: [212, 402], bt: [308, 402], bl: [330, 398] } },
    { t: 1.90, bat: [85, 46], j: 'mid', h: [244, 266] },
    { t: 1.95, bat: [178, 110], j: { hd: [248, 182], fs: [236, 212], bs: [264, 220], fe: [230, 252], be: [246, 262], h: [214, 286], fh: [246, 288], bh: [270, 292], fk: [214, 344], bk: [286, 350], fa: [208, 394], ba: [314, 390], ft: [192, 402], fl: [212, 402], bt: [300, 402], bl: [322, 392] } },
    { t: 2.10, bat: [232, 100], j: { hd: [246, 184], fs: [236, 212], bs: [256, 218], fe: [214, 236], be: [228, 244], h: [196, 254], fh: [244, 288], bh: [264, 290], fk: [212, 344], bk: [278, 350], fa: [208, 394], ba: [304, 388], ft: [192, 402], fl: [212, 402], bt: [292, 402], bl: [314, 388] } },
    { t: 2.38, bat: [380, 92], j: { hd: [244, 184], fs: [238, 212], bs: [252, 214], fe: [214, 206], be: [262, 200], h: [236, 178], fh: [242, 288], bh: [258, 290], fk: [212, 344], bk: [266, 348], fa: [208, 394], ba: [292, 384], ft: [192, 402], fl: [212, 402], bt: [282, 402], bl: [300, 384] } },
    { t: 3.30, bat: [380, 92], j: null }
  ];
  // Fill the held keys and the mid-swing key (halfway between launch and contact, hands set explicitly).
  (function () {
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (k.j === null) k.j = KEYS[i - 1].j;
      if (k.j === 'mid') {
        var a = KEYS[i - 1].j, b = KEYS[i + 1].j, m = {};
        Object.keys(a).forEach(function (n) { m[n] = [(a[n][0] + b[n][0]) / 2, (a[n][1] + b[n][1]) / 2]; });
        m.h = k.h; k.j = m;
      }
    }
  })();
  var T_FOOT = 1.70, T_CONTACT = 1.95, T_RELEASE = 0.45, LOOP = 4.0;
  var ease = function (u) { return u * u * (3 - 2 * u); };
  function pose(t) {
    var i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    var a = KEYS[i], b = KEYS[i + 1], u = ease(c01((t - a.t) / ((b.t - a.t) || 1))), j = {};
    if (t >= KEYS[KEYS.length - 1].t) { a = b; u = 0; }
    Object.keys(a.j).forEach(function (n) { j[n] = [a.j[n][0] + (b.j[n][0] - a.j[n][0]) * u, a.j[n][1] + (b.j[n][1] - a.j[n][1]) * u]; });
    var ang = a.bat[0] + (b.bat[0] - a.bat[0]) * u, len = a.bat[1] + (b.bat[1] - a.bat[1]) * u;
    return { j: j, ang: ang, len: len };
  }
  function c01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  var CONTACT_PT = (function () { var p = pose(T_CONTACT), r = rad(p.ang); return [p.j.h[0] + Math.cos(r) * p.len * 0.8, p.j.h[1] + Math.sin(r) * p.len * 0.8]; })();
  // The pitch: released off to the left, up over a 6-12 ft arc, dropping steeply into the hitting zone.
  var P0 = [-90, 290], P1 = [10, -170];
  // The line drive: from contact through the middle of the left-center gap and out past the wall.
  var OUT = (function () {
    var mid = [HOME[0] + Math.cos(rad(RAYS[0])) * (R_IN + R_OUT) / 2, HOME[1] + Math.sin(rad(RAYS[0])) * (R_IN + R_OUT) / 2];
    return [CONTACT_PT[0] + (mid[0] - CONTACT_PT[0]) * 1.8, CONTACT_PT[1] + (mid[1] - CONTACT_PT[1]) * 1.8];
  })();
  var quad = function (a, b, c, u) { return [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * b[1] + u * u * c[1]]; };

  function drawBat(ctx, W, k, h, ang, len, alpha) {
    var r = rad(ang), dx = Math.cos(r), dy = Math.sin(r), nx = -dy, ny = dx;
    var at = function (d, w) { return W(h[0] + dx * d + nx * w, h[1] + dy * d + ny * w); };
    // Foreshortened as it points at the camera, so the widths shrink a little with the length.
    var f = 0.6 + 0.4 * (len / 110), hw = 1.5 * f, bw = 4.2 * f, knob = -9;
    var pts = [at(knob, hw * 1.7), at(knob + 3, hw), at(len * 0.42, hw * 1.15), at(len * 0.72, bw), at(len, bw), at(len, -bw), at(len * 0.72, -bw), at(len * 0.42, -hw * 1.15), at(knob + 3, -hw), at(knob, -hw * 1.7)];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    var g = ctx.createLinearGradient(at(0, 0)[0], at(0, 0)[1], at(len, 0)[0], at(len, 0)[1]);
    g.addColorStop(0, '#8d939a'); g.addColorStop(0.5, '#d4d8dc'); g.addColorStop(1, '#eef0f2');
    ctx.fillStyle = g; ctx.fill();
    // end cap
    var e1 = at(len, bw), e2 = at(len, -bw);
    ctx.strokeStyle = '#5d6268'; ctx.lineWidth = Math.max(1, k * 1.6);
    ctx.beginPath(); ctx.moveTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke();
    ctx.restore();
  }

  function drawHero(c, sec) {
    var ctx = c.ctx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, c.w, c.h);
    var k = Math.max(c.w / 400, c.h / 440), W = world(c), L = Math.max(1.3, k * 1.25);
    var t = reduce ? T_CONTACT + 0.12 : sec % LOOP;
    // Between loops the hitter resets out of sight: fade out after the finish, fade back in at the stance.
    var alpha = t > 3.45 ? Math.max(0, 1 - (t - 3.45) / 0.25) : t < 0.25 ? t / 0.25 : 1;
    if (t > 3.7) t = 0;
    var p = pose(t);
    var J = function (n) { return W(p.j[n][0], p.j[n][1]); };

    // Ground.
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1;
    var g0 = W(120, 402), g1 = W(380, 402);
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();

    // The pitch arc, faint, always there.
    var a0 = W(P0[0], P0[1]), a1 = W(P1[0], P1[1]), a2 = W(CONTACT_PT[0], CONTACT_PT[1]);
    ctx.save();
    ctx.setLineDash([2, 7]); ctx.lineCap = 'round'; ctx.lineWidth = L; ctx.strokeStyle = 'rgba(196,241,53,0.4)';
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(a1[0], a1[1], a2[0], a2[1]); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    // Swing trail: ghost bats just behind the barrel through the zone.
    if (t > 1.84 && t < 2.2) {
      [0.045, 0.03, 0.015].forEach(function (d, i) {
        var q = pose(t - d);
        drawBat(ctx, W, k, q.j.h, q.ang, q.len, 0.08 + i * 0.06);
      });
    }
    var bones = [['fs', 'bs'], ['fs', 'fh'], ['bs', 'bh'], ['fh', 'bh'], ['fs', 'fe'], ['fe', 'h'], ['bs', 'be'], ['be', 'h'], ['bh', 'bk'], ['bk', 'ba'], ['ba', 'bt'], ['ba', 'bl'], ['bl', 'bt']];
    var front = [['fh', 'fk'], ['fk', 'fa'], ['fa', 'ft'], ['fa', 'fl'], ['fl', 'ft']];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Back arm and back leg first, then the bat, then the front side, so the bat sits between the arms.
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = L * 2;
    bones.forEach(function (b) { var u = J(b[0]), v = J(b[1]); ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke(); });
    drawBat(ctx, W, k, p.j.h, p.ang, p.len, 1);
    ctx.strokeStyle = LIME; ctx.lineWidth = L * 2.8;
    front.forEach(function (b) { var u = J(b[0]), v = J(b[1]); ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke(); });
    // Neck and the batting helmet: a shell with the brim toward the pitcher and an ear flap.
    var hd = J('hd'), sh = J('fs'), sb = J('bs'), neck = [(sh[0] + sb[0]) / 2, (sh[1] + sb[1]) / 2], R = 13 * k;
    ctx.strokeStyle = WHITE; ctx.lineWidth = L * 2;
    ctx.beginPath(); ctx.moveTo(neck[0], neck[1]); ctx.lineTo(hd[0], hd[1] + R * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(hd[0], hd[1], R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(hd[0], hd[1] - R * 0.08, R, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hd[0] - R * 0.9, hd[1] - R * 0.2); ctx.lineTo(hd[0] - R * 1.65, hd[1] - R * 0.02); ctx.lineWidth = L * 2.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hd[0] + R * 0.35, hd[1] - R * 0.1); ctx.lineTo(hd[0] + R * 0.55, hd[1] + R * 0.75); ctx.lineWidth = L * 2.2; ctx.stroke();
    // Joints.
    ['fs', 'bs', 'fe', 'be', 'h', 'bh', 'bk', 'ba'].forEach(function (n) { var q = J(n); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(q[0], q[1], L * 1.7, 0, Math.PI * 2); ctx.fill(); });
    ['fh', 'fk', 'fa'].forEach(function (n) { var q = J(n); ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(q[0], q[1], L * 2.3, 0, Math.PI * 2); ctx.fill(); });
    // Heel strike: a ring on the front heel from the moment it plants.
    if (t >= T_FOOT && t < 3.45) {
      var heel = J('fl'), age = c01((t - T_FOOT) / 0.25);
      ctx.strokeStyle = 'rgba(196,241,53,' + (0.95 - age * 0.45) + ')'; ctx.lineWidth = L * 1.6;
      ctx.beginPath(); ctx.arc(heel[0], heel[1], L * (5 + age * 6), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // The ball: along the arc from release to contact, then the line drive out through the gap.
    if (t >= T_RELEASE && t < T_CONTACT) {
      var u = (t - T_RELEASE) / (T_CONTACT - T_RELEASE), q = quad(P0, P1, CONTACT_PT, u), b = W(q[0], q[1]);
      ball(ctx, b[0], b[1], 4.2 * k);
    } else if (t >= T_CONTACT && t < 3.45) {
      var d = c01((t - T_CONTACT) / 0.42), e = 1 - Math.pow(1 - d, 2);
      var s0 = W(CONTACT_PT[0], CONTACT_PT[1]), x = CONTACT_PT[0] + (OUT[0] - CONTACT_PT[0]) * e, y = CONTACT_PT[1] + (OUT[1] - CONTACT_PT[1]) * e;
      var s1 = W(x, y), gr = ctx.createLinearGradient(s0[0], s0[1], s1[0], s1[1]);
      gr.addColorStop(0, 'rgba(196,241,53,0)'); gr.addColorStop(1, 'rgba(196,241,53,0.95)');
      ctx.strokeStyle = gr; ctx.lineWidth = 4 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
      ball(ctx, s1[0], s1[1], 4.4 * k);
      // Contact flash.
      if (t < T_CONTACT + 0.18) {
        var fa = 1 - (t - T_CONTACT) / 0.18;
        ctx.strokeStyle = 'rgba(255,255,255,' + fa + ')'; ctx.lineWidth = L * 1.4;
        ctx.beginPath(); ctx.arc(s0[0], s0[1], (6 + (1 - fa) * 10) * k, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function ball(ctx, x, y, r) {
    ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
      if (c.kind === 'hero') drawHero(c, sec);
      else if (POSE) draw(c, f);
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
