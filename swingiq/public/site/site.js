/* Gapper site: the page's own motion. The scrollcraft engine drives pins, cues, counts, reveals and the scrub clip;
   this file draws Gapper's side (the tracked skeleton), runs the heel catch, lays the chalk line and collapses the
   split at the end. It never writes to an element the engine animates. */
(function () {
  'use strict';
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
    req.onerror = function (e) { e.preventDefault && e.preventDefault(); };
  } catch (e) { /* storage blocked: stay on the site */ }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = matchMedia('(max-width: 860px)');
  var root = document.documentElement;
  var rail = document.getElementById('rail');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var c01 = function (x) { return clamp(x, 0, 1); };
  var smooth = function (x) { x = c01(x); return x * x * (3 - 2 * x); };

  // Phase times on the source clip (seconds), from Gapper's analyzer run on this swing.
  var FOOT = 4.28, CONTACT = 4.52, END = 7.2;
  // Where each phase sits on the chalk line (fraction of its length). The gap is drawn wider than real time on purpose.
  var CHALK = [[0, 0.19], [0.13, 0.20], [3.07, 0.34], [4.0, 0.45], [FOOT, 0.52], [CONTACT, 0.66], [END, 0.80]];
  var FRONT = [23, 25, 27, 29, 31];                     // right-handed hitter: the left leg leads
  var BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [15, 17], [15, 19], [15, 21], [17, 19],
    [16, 18], [16, 20], [16, 22], [18, 20], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10]];
  var isFront = {}; FRONT.forEach(function (i) { isFront[i] = true; });

  var hero = document.getElementById('stance');
  var peak = document.getElementById('gap');
  var read = document.getElementById('read');
  var fix = document.getElementById('fix');
  var close = document.getElementById('start');
  var video = peak.querySelector('video');
  var ring = peak.querySelector('[data-ring]');
  var counter = peak.querySelector('[data-frames]');
  var heroCanvas = hero.querySelector('canvas');
  var swingCanvas = peak.querySelector('canvas');
  var heroFrame = hero.querySelector('[data-frame]');
  var heroCut = hero.querySelector('.cut');
  var heroPlate = hero.querySelector('.plate');
  var tips = fix.querySelector('.tips');
  var ticks = [].slice.call(rail.querySelectorAll('.tick')).map(function (el) { return { el: el, s: parseFloat(el.getAttribute('data-s')) }; });

  // The hero headline sits between the plate and the batter. Wrap it so the page can move it without touching the
  // element the engine fades.
  var h1 = hero.querySelector('h1');
  var h1wrap = document.createElement('div');
  h1wrap.className = 'h1wrap';
  h1wrap.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;will-change:transform';
  h1.parentNode.insertBefore(h1wrap, h1);
  h1wrap.appendChild(h1);

  var POSE = null, box = null, nominal = { w: 0, h: 0 }, shiftX = 0;

  function coverBox(w, h) {
    var A = 0.8, bw, bh, x = 0, y = 0;
    if (w / h > A) {
      bw = w; bh = w / A;
      var vis = h / bh, top = Math.min(Math.max(0.94 - vis, 0), 1 - vis);
      y = -top * bh;
    } else { bh = h; bw = h * A; x = (w - bw) / 2; }
    return { x: x, y: y, w: bw, h: bh };
  }

  function layout() {
    var ref = hero.querySelector('.pane--eye');
    nominal.w = ref.clientWidth; nominal.h = ref.clientHeight;
    box = coverBox(nominal.w, nominal.h);
    // On a phone the halves stack, so Gapper's figure moves right and leaves the left for the words.
    shiftX = phone.matches ? nominal.w * 0.2 : 0;
    [].forEach.call(document.querySelectorAll('[data-frame]'), function (el) {
      el.style.left = (el.closest('.close') ? 'auto' : box.x + 'px');
      el.style.right = (el.closest('.close') ? (nominal.w - box.w - box.x) + 'px' : 'auto');
      el.style.top = box.y + 'px'; el.style.width = box.w + 'px'; el.style.height = box.h + 'px';
    });
    [heroCanvas, swingCanvas].forEach(function (c) {
      var r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * DPR)); c.height = Math.max(1, Math.round(r.height * DPR));
    });
    if (POSE) {
      var piv = POSE.pivot, heel = POSE.frames[12][29];
      heroCut.style.transformOrigin = heroPlate.style.transformOrigin = (piv[0] * 100) + '% ' + (piv[1] * 100) + '%';
      heroFrame.style.transformOrigin = (heel[0] * 100) + '% ' + (heel[1] * 100) + '%';
    }
    last = {};
  }

  // ---- pose -----------------------------------------------------------------------------------------------------
  function sAt(T) {
    var segs = POSE.segs;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (T <= g.t1) {
        var u = c01((T - g.t0) / ((g.t1 - g.t0) || 1)), s = g.s0 + (g.s1 - g.s0) * u;
        return g.mode === 'step' ? Math.round(s * 25) / 25 : s;
      }
    }
    return segs[segs.length - 1].s1;
  }
  function poseAt(s) {
    var F = POSE.frames, f = clamp(s, 0, END) * 25, i = Math.floor(f), t = f - i;
    var a = F[Math.min(i, F.length - 1)], b = F[Math.min(i + 1, F.length - 1)];
    var out = new Array(a.length);
    for (var k = 0; k < a.length; k++) out[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
    return out;
  }
  function chalkOf(s) {
    for (var i = 1; i < CHALK.length; i++) {
      if (s <= CHALK[i][0]) {
        var a = CHALK[i - 1], b = CHALK[i];
        return a[1] + (b[1] - a[1]) * c01((s - a[0]) / ((b[0] - a[0]) || 1));
      }
    }
    return CHALK[CHALK.length - 1][1];
  }

  // Maps crop coordinates (0..1 of the 4:5 frame) to canvas pixels, with the same zoom and scale the photo side uses.
  function mapper(zoom, scale) {
    var piv = POSE.pivot, heel = POSE.frames[12][29];
    return function (x, y) {
      // inner: scale about the feet (the cutout's depth push)
      x = piv[0] + (x - piv[0]) * scale; y = piv[1] + (y - piv[1]) * scale;
      // outer: zoom about the stance heel (the push to the front foot)
      x = heel[0] + (x - heel[0]) * zoom; y = heel[1] + (y - heel[1]) * zoom;
      return [(box.x + shiftX + x * box.w) * DPR, (box.y + y * box.h) * DPR];
    };
  }

  function drawSkeleton(c, lm, o) {
    var ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    var M = mapper(o.zoom || 1, o.scale || 1);
    var P = lm.map(function (p) { return M(p[0], p[1]); });
    var dim = o.dim || 0, u = DPR * (o.zoom || 1) * Math.min(1, box.w / 560);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ground: a chalk line under the feet, the batter's box seen from the pitcher
    var g = M(0, POSE.pivot[1] + 0.012);
    ctx.strokeStyle = 'rgba(137,149,166,0.32)'; ctx.lineWidth = 1.2 * DPR;
    ctx.beginPath(); ctx.moveTo(0, g[1]); ctx.lineTo(c.width, g[1]); ctx.stroke();
    var bl = M(POSE.pivot[0] - 0.24, 0), br = M(POSE.pivot[0] + 0.24, 0);
    ctx.strokeStyle = 'rgba(137,149,166,0.22)';
    ctx.beginPath(); ctx.moveTo(bl[0], g[1]); ctx.lineTo(bl[0] - 26 * u, g[1] + 40 * u); ctx.moveTo(br[0], g[1]); ctx.lineTo(br[0] + 26 * u, g[1] + 40 * u); ctx.stroke();

    // hand path: where the hands have been over the last half second
    if (o.trail) {
      for (var j = 0; j < o.trail.length - 1; j++) {
        var a = M(o.trail[j][0], o.trail[j][1]), b = M(o.trail[j + 1][0], o.trail[j + 1][1]);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.06 + 0.4 * (j / o.trail.length)).toFixed(3) + ')';
        ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }

    // torso plate, so the figure reads as a body and not a stick drawing
    ctx.fillStyle = 'rgba(255,255,255,' + (0.07 * (1 - dim * 0.6)).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(P[11][0], P[11][1]); ctx.lineTo(P[12][0], P[12][1]); ctx.lineTo(P[24][0], P[24][1]); ctx.lineTo(P[23][0], P[23][1]); ctx.closePath(); ctx.fill();

    BONES.forEach(function (bn) {
      var front = isFront[bn[0]] && isFront[bn[1]];
      var face = bn[0] < 11;
      ctx.strokeStyle = front ? '#B7F34A' : 'rgba(255,255,255,' + ((face ? 0.45 : 0.82) * (1 - dim * 0.78)).toFixed(3) + ')';
      ctx.lineWidth = (front ? 4.2 : face ? 1.3 : 2.9) * u;
      ctx.shadowColor = front ? 'rgba(183,243,74,0.55)' : 'transparent'; ctx.shadowBlur = front ? 10 * DPR : 0;
      ctx.beginPath(); ctx.moveTo(P[bn[0]][0], P[bn[0]][1]); ctx.lineTo(P[bn[1]][0], P[bn[1]][1]); ctx.stroke();
    });
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    for (var k = 0; k < P.length; k++) {
      var front2 = isFront[k], face2 = k < 11;
      ctx.fillStyle = front2 ? '#B7F34A' : face2 ? 'rgba(169,179,193,' + (0.8 * (1 - dim * 0.7)).toFixed(3) + ')' : 'rgba(255,255,255,' + (1 - dim * 0.75).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(P[k][0], P[k][1], (face2 ? 1.7 : front2 ? 4.2 : 3.5) * u, 0, Math.PI * 2); ctx.fill();
    }

    if (o.ring) {
      var h = P[29];
      ctx.strokeStyle = 'rgba(183,243,74,' + o.ring.o.toFixed(3) + ')';
      ctx.lineWidth = 3 * DPR;
      ctx.beginPath(); ctx.arc(h[0], h[1], 30 * DPR * o.ring.s, 0, Math.PI * 2); ctx.stroke();
    }

    if (o.labels) {
      ctx.font = '600 ' + Math.round(12 * DPR) + 'px "Mona Sans", sans-serif';
      ctx.textBaseline = 'middle';
      o.labels.forEach(function (L) {
        var p = P[L.i], dx = L.dx * DPR, dy = (L.dy || 0) * DPR;
        ctx.globalAlpha = L.a;
        ctx.strokeStyle = L.lime ? '#B7F34A' : 'rgba(169,179,193,0.8)'; ctx.lineWidth = 1 * DPR;
        ctx.beginPath(); ctx.moveTo(p[0] + Math.sign(dx) * 7 * DPR, p[1]); ctx.lineTo(p[0] + dx, p[1] + dy); ctx.stroke();
        ctx.fillStyle = L.lime ? '#B7F34A' : '#A9B3C1';
        ctx.textAlign = dx > 0 ? 'left' : 'right';
        ctx.fillText(L.t, p[0] + dx + Math.sign(dx) * 5 * DPR, p[1] + dy);
        ctx.globalAlpha = 1;
      });
    }
  }

  // ---- per frame ------------------------------------------------------------------------------------------------
  var last = {}, maxFill = 0;
  function pinP(el) {
    var r = el.getBoundingClientRect(), vh = innerHeight;
    return { p: c01(-r.top / Math.max(1, r.height - vh)), on: r.top < vh && r.bottom > 0, r: r };
  }
  function set(el, prop, val, key) {
    if (last[key] === val) return;
    last[key] = val; el.style.setProperty(prop, val);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!POSE || !box) return;
    var vh = innerHeight, y = scrollY;

    // ACT 1: depth push, then the push in to the front foot
    var H = pinP(hero);
    if (H.on) {
      var k1 = reduce ? 0 : smooth(H.p / 0.45), z = reduce ? 0 : smooth((H.p - 0.48) / 0.5);
      var hk = k1.toFixed(4) + '|' + z.toFixed(4);
      if (last.hero !== hk) {
        last.hero = hk;
        if (!reduce) {
          heroCut.style.transform = 'scale(' + (1 + 0.05 * k1).toFixed(4) + ')';
          heroPlate.style.transform = 'scale(' + (1 + 0.012 * k1).toFixed(4) + ')';
          h1wrap.style.transform = 'translate3d(0,' + (k1 * 3.2).toFixed(3) + 'vh,0)';
          heroFrame.style.transform = 'scale(' + (1 + 0.55 * z).toFixed(4) + ')';
        }
        var lab = 1 - smooth(z * 2.2);
        drawSkeleton(heroCanvas, POSE.frames[12], {
          zoom: 1 + 0.55 * z, scale: 1 + 0.05 * k1, dim: z,
          labels: [
            { i: 0, t: 'Head', dx: 44, dy: -14, a: lab * 0.9 },
            { i: 16, t: 'Hands', dx: -40, dy: -10, a: lab * 0.9 },
            { i: 29, t: 'Front heel', dx: phone.matches ? -54 : 46, dy: 18, a: Math.max(lab, z), lime: true }
          ]
        });
      }
    }

    // ACT 2: the swing, the heel catch, the count
    var r = peak.getBoundingClientRect();
    var vraw = c01((vh - r.top) / (r.height + vh));
    var Ttarget = vraw * POSE.total;
    var painted = !reduce && peak.classList.contains('sc-has-clip') && video.readyState >= 1;
    var T = painted ? video.currentTime : Ttarget;
    var s = sAt(T), sScroll = sAt(Ttarget);
    var sRail = painted ? s : sScroll;
    var inPeak = vraw > 0 && vraw < 1;
    if (inPeak) {
      var sDraw = reduce ? FOOT : s;
      var key = sDraw.toFixed(4) + '|' + box.w;
      var caught = sDraw >= FOOT - 0.001 && sDraw <= CONTACT + 0.001;
      var since = T - POSE.segs[1].t0;                         // time into the hold
      var ringS = reduce ? 1 : (since >= 0 && since < 0.35 ? 1.7 - 0.7 * smooth(since / 0.35) : 1);
      var ringO = caught ? 1 : 0;
      if (last.swing !== key + '|' + ringS.toFixed(3)) {
        last.swing = key + '|' + ringS.toFixed(3);
        var lm = poseAt(sDraw), trail = [];
        if (!reduce) for (var ts = Math.max(0, sDraw - 0.5); ts <= sDraw + 1e-6; ts += 0.04) {
          var q = poseAt(ts); trail.push([(q[15][0] + q[16][0]) / 2, (q[15][1] + q[16][1]) / 2]);
        }
        drawSkeleton(swingCanvas, lm, { trail: trail, ring: caught ? { o: ringO, s: ringS } : null, dim: caught ? 0.35 : 0 });
        var hp = lm[29];
        ring.style.left = (hp[0] * 100) + '%'; ring.style.top = (hp[1] * 100) + '%';
        ring.style.opacity = ringO; ring.style.transform = 'scale(' + ringS.toFixed(3) + ')';
      }
      var n = sRail < FOOT - 0.001 ? 0 : Math.min(6, Math.round((sRail - FOOT) * 25));
      if (reduce) n = 6;
      if (last.n !== n) { last.n = n; counter.textContent = String(n); counter.classList.toggle('is-done', n === 6); }
    }

    // THE CHALK LINE: laid as you scroll, following the swing while it plays
    var peakTop = r.top + y, startY = peakTop - vh, endY = peakTop + r.height;
    var maxY = Math.max(1, document.documentElement.scrollHeight - vh);
    var chalk;
    if (vraw <= 0) chalk = 0.19 * c01(y / Math.max(1, startY));
    else if (vraw >= 1) chalk = 0.80 + 0.20 * c01((y - endY) / Math.max(1, maxY - endY));
    else chalk = chalkOf(sRail);
    set(rail, '--chalk', chalk.toFixed(4), 'chalk');
    var fill = c01((sRail - FOOT) / (CONTACT - FOOT));
    if (inPeak) maxFill = Math.max(maxFill, fill);
    var stamped = maxFill >= 0.999;
    set(rail, '--fill', (inPeak ? fill : stamped ? 1 : 0).toFixed(4), 'fill');
    if (last.peakOn !== inPeak) { last.peakOn = inPeak; rail.classList.toggle('is-peak', inPeak); }
    if (last.stamped !== stamped) { last.stamped = stamped; rail.classList.toggle('is-stamped', stamped); }
    var nowIdx = -1;
    ticks.forEach(function (t, i) { if (sRail >= t.s - 0.001 && (nowIdx < 0 || t.s >= ticks[nowIdx].s)) nowIdx = i; });
    var tk = inPeak ? nowIdx + '|' + sRail.toFixed(2) : 'off';
    if (last.ticks !== tk) {
      last.ticks = tk;
      ticks.forEach(function (t, i) {
        t.el.classList.toggle('is-past', inPeak && sRail >= t.s - 0.001);
        t.el.classList.toggle('is-now', inPeak && i === nowIdx);
      });
    }

    // ACT 3: bars grow with the numbers
    var R = pinP(read);
    if (R.on) set(read, '--grow', (reduce ? 1 : smooth((R.p - 0.06) / 0.45)).toFixed(4), 'grow');

    // ACT 4: the ten tips fade back once the one fix lands
    var X = pinP(fix);
    if (X.on) { var dimv = (1 - 0.74 * smooth((X.p - 0.3) / 0.28)).toFixed(3); if (last.tips !== dimv) { last.tips = dimv; tips.style.opacity = dimv; } }

    // ACT 6: the collapse. The chalk line runs to the edge and Gapper's side takes the screen.
    var C = pinP(close);
    var k = reduce ? (C.p > 0.3 ? 1 : 0) : smooth((C.p - 0.03) / 0.44);
    set(root, '--split', (50 * (1 - k)).toFixed(3) + '%', 'split');
    var closed = k > 0.9;
    if (last.closed !== closed) { last.closed = closed; rail.classList.toggle('is-closed', closed); }
  }

  fetch('/site/assets/pose.json').then(function (res) { return res.json(); }).then(function (d) {
    POSE = d;
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { last = {}; });
  }).catch(function () { /* the photo side and the copy still tell the story */ });

  var rt = 0;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (POSE) layout(); }, 120); });
  phone.addEventListener && phone.addEventListener('change', function () { if (POSE) layout(); });
  requestAnimationFrame(frame);
})();
