'use strict';
/* =============================================================
   boot.js — Cinematic boot animation
   Javier Portfolio
   ============================================================= */

/* ═══ BOOT TIMING — single source of truth ═══ */
const BOOT_TIMING = Object.freeze({
  SWEEP_START:   0,
  SWEEP_END:     280,
  COMPILE_START: 280,
  COMPILE_END:   900,
  PROMPT_START:  900,
  PROMPT_END:    1280,
  FADE_START:    1280,
  FADE_DUR:      420,
  HARD_CAP:      1900,
  HERO_WARMUP:   180,
  REDUCED_FADE:  220,
});
const CODE_TOKENS = Object.freeze([
  '<', '/>', '</', '{', '}', '()', '=>', ';', '.',
  'div', 'span', 'data-', 'class=', 'src=',
  '0x7a', '0xff', '#7adfc8', '0b1011',
  '//', '/*', '*/', 'fn', 'def', 'let'
]);

(function validateBootTiming(){
  const T = BOOT_TIMING;
  const ok =
    Object.isFrozen(T) &&
    T.SWEEP_END   <= T.COMPILE_START &&
    T.COMPILE_END <= T.PROMPT_START  &&
    T.PROMPT_END  <= T.FADE_START    &&
    T.FADE_START + T.FADE_DUR <= T.HARD_CAP &&
    T.HARD_CAP   + T.FADE_DUR <= 2200;
  if(!ok) console.warn('[boot] BOOT_TIMING invariants violated', T);
})();

/* ═══ HELPERS ═══ */
function spawnParticles(container){
  const isMobile = matchMedia('(max-width: 540px)').matches;
  const count = isMobile ? 12 : 24;
  const W = innerWidth, H = innerHeight;
  const out = [];
  for(let i = 0; i < count; i++){
    const s = document.createElement('span');
    s.className = 'p';
    s.textContent = CODE_TOKENS[i % CODE_TOKENS.length];
    const edge = i % 4;
    let x, y;
    switch(edge){
      case 0: x = Math.random() * W; y = -20; break;
      case 1: x = W + 20;            y = Math.random() * H; break;
      case 2: x = Math.random() * W; y = H + 20; break;
      default: x = -20;              y = Math.random() * H;
    }
    s.style.setProperty('--sx', x + 'px');
    s.style.setProperty('--sy', y + 'px');
    s.style.setProperty('--d',  Math.round(Math.random() * 220) + 'ms');
    container.appendChild(s);
    out.push(s);
  }
  return out;
}

function buildBootScene(overlay){
  overlay.innerHTML =
    '<div class="boot-crt"></div>' +
    '<div class="boot-grid"></div>' +
    '<div class="boot-sweep"></div>' +
    '<div class="boot-particles"></div>' +
    '<div class="boot-name">' +
      '<span class="g">j</span><span class="g">a</span><span class="g">v</span>' +
      '<span class="g">i</span><span class="g">e</span><span class="g">r</span>' +
      '<span class="g dot">.</span>' +
      '<span class="g">d</span><span class="g">e</span><span class="g">v</span>' +
    '</div>' +
    '<div class="boot-prompt">' +
      '<span class="p-arrow">&gt;</span><span class="p-txt"> ready</span><span class="p-caret"></span>' +
    '</div>';
  overlay.dataset.state = 'idle';
  const partsContainer = overlay.querySelector('.boot-particles');
  const particles = spawnParticles(partsContainer);
  return {
    particles,
    name:   overlay.querySelector('.boot-name'),
    prompt: overlay.querySelector('.boot-prompt')
  };
}

function attachAbortListeners(onAbort){
  const evts = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
  let fired = false;
  function handler(e){
    if(fired) return;
    fired = true;
    try{ e.stopPropagation(); }catch(_){}
    cleanup();
    try{ onAbort(); }catch(_){}
  }
  function cleanup(){
    evts.forEach(name => window.removeEventListener(name, handler, { capture: true }));
  }
  evts.forEach(name => window.addEventListener(name, handler, { once: true, passive: true, capture: true }));
  let disposed = false;
  return function dispose(){
    if(disposed) return;
    disposed = true;
    cleanup();
  };
}

function beginMorph(){
  const overlay = document.getElementById('boot-overlay');
  if(!overlay) return;
  const bootName = overlay.querySelector('.boot-name');
  const heroName = document.querySelector('#hero h1 [data-ref="name"]');
  if(!bootName || !heroName) return;

  void heroName.offsetWidth;

  const heroRect = heroName.getBoundingClientRect();
  const bootRect = bootName.getBoundingClientRect();
  if(heroRect.width === 0 || heroRect.height === 0) return;
  if(bootRect.width === 0 || bootRect.height === 0) return;

  const scale = heroRect.height / bootRect.height;
  const dx = heroRect.left - bootRect.left;
  const dy = heroRect.top  - bootRect.top;

  overlay.classList.add('morph');
  bootName.style.transform =
    'translate(' + dx + 'px,' + dy + 'px) scale(' + scale.toFixed(3) + ')';

  const NOISE = '▓░▒█▐▌│┤╡╢╣╗╝┐└┴┬├─┼═╬';
  const glyphs = [...bootName.querySelectorAll('.g')];
  const orig = glyphs.map(g => g.textContent);
  const isDot = glyphs.map(g => g.classList.contains('dot'));
  const t0 = performance.now();
  const SCRAMBLE_DUR = 360;
  function tick(now){
    const p = (now - t0) / SCRAMBLE_DUR;
    if(p >= 1){
      glyphs.forEach((g, i) => { if(!isDot[i]) g.textContent = ''; });
      return;
    }
    glyphs.forEach((g, i) => {
      if(isDot[i]) return;
      if(i >= 7) return;
      g.textContent = NOISE[(Math.random() * NOISE.length) | 0];
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function tagPageForCompile(){
  const shell = document.querySelector('.shell');
  if(!shell || shell.dataset.compileTagged === '1') return;
  shell.dataset.compileTagged = '1';

  const sectionDelays = [
    ['#hero',           0],
    ['header.top',      0],
    ['#skills',         60],
    ['#projects',       100],
    ['#all-projects',   140],
    ['#log',            180],
    ['#contact',        200],
    ['footer.foot',     220],
  ];

  const LEAF_SEL = [
    '.brand-text', 'header.top nav a',
    '.proj-tag', '.proj-file', '.proj-num', '.vis-label',
    '.pm-key', '.pm-val',
    '.cat-n', '.cat-yr', '.cat-st', '.cat-tag',
    '.gitlog .hash', '.gitlog .who',
    '.contact-links a .lbl', '.contact-links a .val',
    '.foot span', '.foot a',
    '.marquee-track > span',
    '.min-stat',
  ].join(',');

  let stagger = 0;
  sectionDelays.forEach(([sel, base]) => {
    const root = document.querySelector(sel);
    if(!root) return;
    root.querySelectorAll(LEAF_SEL).forEach(el => {
      if(el.hasAttribute('data-compile')) return;
      const txt = (el.textContent || '').trim();
      if(!txt || txt.length > 80) return;
      if(el.querySelector('img,svg,canvas,video')) return;
      if(el.children.length > 0) return;
      el.setAttribute('data-compile', '');
      el.setAttribute('data-compile-dur', '300');
      el.setAttribute('data-compile-delay', String(base + (stagger += 8)));
      el.style.opacity = '0';
    });
  });
}

function scheduleBootActs(scene, done){
  let state = 'idle';
  const timers = [];
  function transition(next){ if(state === 'done') return; state = next; }
  function at(ms, fn){ timers.push(setTimeout(fn, ms)); }
  function clearAll(){ while(timers.length) clearTimeout(timers.pop()); }
  function ovEl(){ return document.getElementById('boot-overlay'); }

  at(BOOT_TIMING.SWEEP_START, () => {
    if(state === 'aborted' || state === 'done' || state === 'fading') return;
    transition('sweep');
    const o = ovEl(); if(o) o.classList.add('act-sweep');
  });

  at(BOOT_TIMING.COMPILE_START, () => {
    if(state === 'aborted' || state === 'done' || state === 'fading') return;
    transition('compile');
    const o = ovEl(); if(o) o.classList.add('act-compile');
    const glyphs = scene.name.querySelectorAll('.g');
    const span = BOOT_TIMING.COMPILE_END - BOOT_TIMING.COMPILE_START;
    glyphs.forEach((g, i) => {
      const dt = Math.round((i + 1) * span / glyphs.length);
      at(dt, () => { if(state !== 'aborted' && state !== 'done') g.classList.add('lit'); });
    });
  });

  at(BOOT_TIMING.PROMPT_START, () => {
    if(state === 'aborted' || state === 'done' || state === 'fading') return;
    transition('prompt');
    const o = ovEl(); if(o) o.classList.add('act-prompt');
  });

  at(BOOT_TIMING.FADE_START, () => {
    if(state === 'done' || state === 'fading' || state === 'aborted') return;
    transition('fading');
    const o = ovEl(); if(o) o.classList.add('fade-out');
  });

  at(BOOT_TIMING.FADE_START + BOOT_TIMING.FADE_DUR, () => {
    if(state === 'done') return;
    transition('done');
    clearAll();
    done();
  });

  return function abort(){
    if(state === 'done' || state === 'fading' || state === 'aborted') return;
    transition('aborted');
    clearAll();
    const o = ovEl(); if(o) o.classList.add('fade-out');
    setTimeout(() => {
      if(state === 'done') return;
      transition('done');
      done();
    }, BOOT_TIMING.FADE_DUR);
  };
}
