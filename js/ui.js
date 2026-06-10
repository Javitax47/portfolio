'use strict';
/* =============================================================
   ui.js — Hero init, canvas visualizations, GW metrics,
            catalog filter, HUD scroll tracker
   Javier Portfolio
   ============================================================= */

/* ═══ HERO INIT ═══ */
function initHero(){
  const tl = document.getElementById('hero-tagline');
  if(tl){
    const lang = document.documentElement.dataset.lang||'es';
    const n = Math.floor(Math.random()*3);
    tl.dataset.variant = String(n);
    const v = tl.getAttribute('data-'+lang+'-'+n);
    if(v) tl.innerHTML = v;
  }
  const NOISE='▓░▒█▐▌│┤╡╢╣╗╝┐└┴┬├─┼═╬ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$';
  function compileEl(el){
    if(el.dataset.compiled) return; el.dataset.compiled='1';
    const orig=el.textContent, len=orig.length;
    const dur=+(el.dataset.compileDur||380);
    const delay=+(el.dataset.compileDelay||0);
    el.style.opacity='1';
    const useTypewriter = Math.random() < 0.5;
    function run(){
      if(useTypewriter){
        let i=0;
        const interval = Math.max(5, (dur*0.6)/len);
        el.textContent='█';
        function step(){
          if(i>=len){el.textContent=orig;return;}
          i++; el.textContent=orig.slice(0,i)+'█';
          setTimeout(step, interval + (Math.random()*interval*0.4));
        }
        step();
      } else {
        const slowDur = dur * 1.6;
        const t0=performance.now();
        function tick(now){
          const p=Math.min(1,(now-t0)/slowDur);
          const resolved=Math.floor(Math.pow(p,0.55)*len);
          if(p>=1){el.textContent=orig;return;}
          let s='';
          for(let i=0;i<len;i++) s+=(i<resolved||orig[i]===' '||orig[i]==='\n')?orig[i]:NOISE[Math.floor(Math.random()*NOISE.length)];
          el.textContent=s;
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    }
    if(delay>0) setTimeout(run, delay); else run();
  }
  const cio=new IntersectionObserver(entries=>entries.forEach(e=>{if(!e.isIntersecting)return;compileEl(e.target);cio.unobserve(e.target);}),{threshold:0.15});
  document.querySelectorAll('[data-compile]').forEach(el=>{el.style.opacity='0';cio.observe(el);});
  window.__rearm_compile = function(el){
    delete el.dataset.compiled; el.style.opacity = '0'; el.classList.remove('compile-done'); cio.observe(el);
  };

  initWaveform();

  const pio=new IntersectionObserver(entries=>entries.forEach(e=>{
    if(!e.isIntersecting) return;
    const panel=e.target;
    const fill=panel.querySelector('.proj-boot-fill');
    if(fill){ requestAnimationFrame(()=>{ fill.style.width='100%'; }); }
    setTimeout(()=>{ panel.classList.add('booted'); initVis(panel); if(typeof initMediaMosaic==='function'){ try{ initMediaMosaic(panel); }catch(err){ console.warn('[media-mosaic] init failed', err); } } },440);
    pio.unobserve(panel);
  }),{threshold:0, rootMargin:'0px 0px -10% 0px'});
  document.querySelectorAll('.proj-panel').forEach(p=>pio.observe(p));
}

/* ═══ CANVAS VISUALIZATIONS ═══ */
function initVis(panel){
  const proj=panel.dataset.proj;
  const canvas=panel.querySelector('.proj-canvas');
  if(!canvas) return;
  if(canvas._visAbort) canvas._visAbort();
  let aborted = false;
  canvas._visAbort = ()=>{ aborted = true; };
  const vis=canvas.parentElement;
  function resize(){
    canvas.width  = Math.max(1, vis.clientWidth  || 400);
    canvas.height = Math.max(1, vis.clientHeight || 84);
  }
  resize();
  new ResizeObserver(resize).observe(vis);
  const ctx=canvas.getContext('2d');
  const panelCS = getComputedStyle(panel);
  const MONO_FAMILY = panelCS.getPropertyValue('--mono') || "'JetBrains Mono', ui-monospace, Menlo, monospace";
  function readRGB(name, fallback){
    const v = panelCS.getPropertyValue(name).trim(); return v || fallback;
  }
  const RGB_CARD  = readRGB('--canvas-card',  '24, 27, 36');
  const RGB_CELL  = readRGB('--canvas-cell',  '31, 35, 48');
  const RGB_TRAIL = readRGB('--canvas-trail', '11, 12, 16');
  const RGB_STAR  = readRGB('--canvas-star',  '236, 230, 214');

  let isHover = false, hovT = 0, mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
  vis.addEventListener('mouseenter', ()=>isHover=true);
  vis.addEventListener('mouseleave', ()=>{ isHover=false; tmx=0.5; tmy=0.5; });
  vis.addEventListener('mousemove', e=>{
    const rect = vis.getBoundingClientRect();
    tmx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    tmy = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
  });

  function runRender(drawFn) {
    let isVisible = true, isPlaying = false, lastT = 0;
    const MIN_INTERVAL = 1000 / 50;
    function start(){
      if(!isVisible || isPlaying || aborted) return;
      isPlaying = true;
      requestAnimationFrame(function loop(now){
        if(!isVisible || aborted){ isPlaying = false; return; }
        if(now - lastT >= MIN_INTERVAL){ lastT = now; drawFn(now); }
        requestAnimationFrame(loop);
      });
    }
    start();
    const io = new IntersectionObserver(e => {
      isVisible = e[0].isIntersecting; if(isVisible) start();
    }, {threshold:0});
    io.observe(vis);
  }

  if(proj==='gw'){
    let ph=0;
    runRender(function draw(){
      hovT += (isHover ? 0.08 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.1;
      const W=canvas.width,H=canvas.height,mid=H/2;
      ctx.clearRect(0,0,W,H);
      ctx.strokeStyle='rgba(122,223,200,0.08)'; ctx.lineWidth=1;
      for(let y=H*0.25;y<H;y+=H*0.25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      ctx.beginPath();
      ctx.strokeStyle='rgba(122,223,200,0.85)'; ctx.lineWidth=1.5;
      const speed = 0.028 + hovT*0.06;
      const peakX = 0.8 - hovT * (0.8 - mx);
      for(let x=0;x<W;x+=2){
        const t=x/W;
        const distToPeak = Math.abs(t - peakX);
        const f = 0.018 * Math.pow(1 + t*9, 2.4) * (1 + hovT*0.6);
        const env = Math.exp(-Math.pow(distToPeak * 3, 2)) * hovT;
        const a = mid * (0.28 + t*0.72) * 0.88 * (1 + env*0.8);
        const y = mid + Math.sin(ph + t*W*f) * a;
        x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke();
      ph+=speed;
    });
  } else if(proj==='nltl'){
    let t=0;
    runRender(function draw(){
      hovT += (isHover ? 0.08 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.1;
      const W=canvas.width,H=canvas.height,mid=H/2;
      ctx.clearRect(0,0,W,H);
      const baseHx = W*(window._nltlHorizon||0.5);
      const hx = baseHx + hovT * (mx*W - baseHx);
      ctx.strokeStyle='rgba(255,110,126,0.4)'; ctx.lineWidth=1; ctx.setLineDash([4,6]);
      ctx.beginPath(); ctx.moveTo(hx,0); ctx.lineTo(hx,H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='rgba(255,110,126,0.10)'; ctx.fillRect(hx,0,W-hx,H);
      ctx.beginPath();
      ctx.strokeStyle='rgba(122,223,200,0.85)'; ctx.lineWidth=1.5;
      for(let x=0;x<W;x+=2){
        const xn=x/W;
        const phase=t*(1/(0.05+Math.abs(xn-hx/W)*2.5));
        const amp=mid*0.5*Math.exp(-Math.pow((xn-(hx/W-0.22))*8,2));
        const pull = hovT * Math.exp(-Math.pow((xn-mx)*4,2)) * (my-0.5) * H * 0.6;
        const y=mid + Math.sin(phase*14)*amp + pull;
        x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke();
      t += 0.025 + hovT*0.035;
    });
  } else if(proj==='cosmos'){
    const layers = [
      { count: 22, speed: 0.6, size: 0.6, alpha: 0.45 },
      { count: 14, speed: 1.4, size: 0.9, alpha: 0.65 },
      { count:  8, speed: 2.6, size: 1.3, alpha: 0.95 },
    ];
    const stars = layers.flatMap(L =>
      Array.from({length: L.count}, () => ({
        x: Math.random(), y: Math.random(),
        r: L.size * (0.6 + Math.random()*0.6),
        spd: L.speed, a: L.alpha, b: Math.random(),
      }))
    );
    let planetX = 1.15;
    runRender(function draw(){
      hovT += (isHover ? 0.06 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const yOff = (my - 0.5) * H * 0.25 * hovT;
      const baseSpeed = 0.0008 * (1 + hovT*1.6);
      stars.forEach(s => {
        s.x -= s.spd * baseSpeed;
        if(s.x < -0.02){ s.x = 1.02; s.y = Math.random(); }
        s.b += 0.005 + hovT*0.01; if(s.b > 1) s.b = 0;
        const tw = 0.4 + Math.abs(Math.sin(s.b * Math.PI)) * 0.6;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + RGB_STAR + ',' + (s.a * tw) + ')';
        ctx.arc(s.x*W, s.y*H + yOff*s.spd*0.3, s.r, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(180,156,255,0.12)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
      ctx.moveTo(0, H*0.5 + yOff); ctx.lineTo(W, H*0.5 + yOff);
      ctx.stroke(); ctx.setLineDash([]);
      planetX -= 0.0014 * (1 + hovT*0.8);
      if(planetX < -0.15) planetX = 1.15;
      const cx = planetX * W, cy = H * 0.5 + yOff;
      const pr = Math.min(H * 0.45, 22);
      const halo = ctx.createRadialGradient(cx, cy, pr*0.3, cx, cy, pr*2.4);
      halo.addColorStop(0, 'rgba(180,156,255,0.35)');
      halo.addColorStop(1, 'rgba(180,156,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - pr*2.4, cy - pr*2.4, pr*4.8, pr*4.8);
      ctx.beginPath();
      const g = ctx.createRadialGradient(cx - pr*0.35, cy - pr*0.35, pr*0.15, cx, cy, pr);
      g.addColorStop(0, 'rgba(120,140,180,0.95)');
      g.addColorStop(1, 'rgba(30,40,70,0.95)');
      ctx.fillStyle = g;
      ctx.arc(cx, cy, pr, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + RGB_TRAIL + ',0.55)';
      ctx.arc(cx + pr*0.35, cy, pr*0.95, 0, Math.PI*2);
      ctx.fill();
    });
  } else if(proj==='physdeck'){
    function mkParticle(x, y, vx, vy, depth){ return { x, y, vx, vy, life: 1, depth }; }
    let particles = [mkParticle(0, 0.5, 0.0014, 0, 0)];
    runRender(function draw(){
      hovT += (isHover ? 0.08 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.1; my += (tmy - my) * 0.1;
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(' + RGB_TRAIL + ',0.22)';
      ctx.fillRect(0, 0, W, H);
      const next = [];
      particles.forEach(p => {
        const pullY = (my - p.y) * 0.0006 * hovT;
        p.vy += pullY; p.vy *= 0.96;
        p.x += p.vx; p.y += p.vy; p.life -= 0.005;
        if(p.life <= 0 || p.x > 1.05) return;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(111,178,240,' + (p.life * 0.85) + ')';
        ctx.lineWidth = 1;
        ctx.moveTo((p.x - p.vx) * W, p.y * H);
        ctx.lineTo(p.x * W, p.y * H);
        ctx.stroke();
        if(Math.random() < (0.018 + hovT*0.022) && p.depth < 4 && particles.length < 80){
          const spread = (Math.random() - 0.5) * 0.012;
          next.push(mkParticle(p.x, p.y, p.vx*(0.92 + Math.random()*0.08), p.vy + spread, p.depth + 1));
          next.push(mkParticle(p.x, p.y, p.vx*(0.92 + Math.random()*0.08), p.vy - spread, p.depth + 1));
        }
        next.push(p);
      });
      particles = next;
      if(particles.length < 10){
        particles.push(mkParticle(0, 0.25 + Math.random() * 0.5, 0.0010 + Math.random() * 0.0010, (Math.random() - 0.5) * 0.002, 0));
      }
    });
  } else if(proj==='mineralia'){
    const COLS = 28, ROWS = 2, TOTAL = COLS * ROWS;
    const cells = Array.from({ length: TOTAL }, (_, i) => ({
      filled: false, t: 0, delay: i * 18 + Math.random() * 90,
    }));
    let syncIdx = Math.floor(Math.random() * TOTAL), syncT = 0;
    const start = performance.now();
    runRender(function draw(now){
      hovT += (isHover ? 0.08 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.15; my += (tmy - my) * 0.15;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const pw = W / COLS, ph = H / ROWS, pad = 1.5;
      const elapsed = now - start;
      cells.forEach((c, i) => {
        if(!c.filled && elapsed > c.delay){ c.filled = true; c.t = 0; }
        if(c.filled && c.t < 1) c.t = Math.min(1, c.t + 0.08);
        const r = Math.floor(i / COLS), col = i % COLS;
        const x = col * pw + pad, y = r * ph + pad;
        const cw = pw - pad * 2, ch = ph - pad * 2;
        const cx0 = x + cw/2, cy0 = y + ch/2;
        const dist = Math.hypot(mx*W - cx0, my*H - cy0);
        const glow = Math.max(0, 1 - dist/70) * hovT;
        ctx.fillStyle = 'rgba(' + RGB_CELL + ',' + (0.85 - glow*0.4) + ')';
        ctx.fillRect(x, y, cw, ch);
        if(c.t > 0){
          ctx.fillStyle = 'rgba(97,208,149,' + (c.t*0.18 + glow*0.32) + ')';
          ctx.fillRect(x, y, cw * c.t, ch);
          ctx.strokeStyle = 'rgba(97,208,149,' + (c.t*0.55 + glow*0.45) + ')';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        }
        if(i === syncIdx){
          syncT += 0.08;
          const pulse = Math.abs(Math.sin(syncT));
          ctx.fillStyle = 'rgba(97,208,149,' + (0.1 + pulse*0.32 + glow*0.2) + ')';
          ctx.fillRect(x, y, cw, ch);
        }
      });
      if(Math.random() < 0.05) syncIdx = (syncIdx + 1) % TOTAL;
      if(Math.random() < 0.006) syncIdx = Math.floor(Math.random() * TOTAL);
    });
  } else if(proj==='mario'){
    const CARDS = ['ATHLETIC', '1-1 OVERWORLD', 'STAR ROAD', 'BOWSER', 'GUSTY GARDEN', 'STAFF ROLL', 'FORTRESS'];
    let scroll = 0, score = 142, lastFocusKey = -1;
    const totalCards = CARDS.length;
    const AUTO_PX_PER_FRAME = 0.5;
    runRender(function draw(){
      hovT += (isHover ? 0.08 : -0.05); hovT = Math.max(0, Math.min(1, hovT));
      mx += (tmx - mx) * 0.15;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cardW = Math.min(120, W * 0.14);
      const cardH = H * 0.66;
      const gap = 14, stride = cardW + gap, cycle = stride * totalCards;
      if(isHover){ scroll = (mx - 0.5) * cycle; }
      else { scroll += AUTO_PX_PER_FRAME * (1 + hovT * 0.6); }
      const cy = H/2;
      const startK = -Math.ceil(W / cycle) - 1, endK = Math.ceil(W / cycle) + 1;
      let bestFocus = -1, bestDist = Infinity, bestKey = -1;
      for(let k = startK; k <= endK; k++){
        for(let i = 0; i < totalCards; i++){
          const cx = (i*stride + k*cycle) - scroll + W/2;
          if(cx < -cardW || cx > W + cardW) continue;
          const dist = Math.abs(cx - W/2);
          if(dist < bestDist){ bestDist = dist; bestFocus = i; bestKey = k * totalCards + i; }
        }
      }
      if(bestKey !== lastFocusKey){ if(lastFocusKey !== -1) score++; lastFocusKey = bestKey; }
      for(let k = startK; k <= endK; k++){
        for(let i = 0; i < totalCards; i++){
          const cx = (i*stride + k*cycle) - scroll + W/2;
          if(cx < -cardW || cx > W + cardW) continue;
          const dist = Math.abs(cx - W/2);
          const focus = Math.max(0, 1 - dist / (W*0.5));
          const scale = 0.78 + focus * 0.32;
          const w = cardW * scale, h = cardH * scale;
          const alpha = 0.35 + focus * 0.65;
          ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha = alpha;
          ctx.fillStyle = 'rgba(' + RGB_CARD + ',0.95)';
          ctx.strokeStyle = 'rgba(255,144,168,' + (0.25 + focus*0.6) + ')';
          ctx.lineWidth = 1.25;
          roundRect(ctx, -w/2, -h/2, w, h, 4);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,144,168,' + (0.5 + focus*0.4) + ')';
          ctx.font = 'bold ' + Math.round(w*0.22) + 'px ' + MONO_FAMILY;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('♫', 0, -h*0.32);
          if(focus > 0.5){
            ctx.fillStyle = 'rgba(' + RGB_STAR + ',' + (focus*0.7) + ')';
            ctx.font = Math.round(w*0.10) + 'px ' + MONO_FAMILY;
            ctx.fillText(CARDS[i], 0, h*0.10);
            ctx.fillStyle = 'rgba(255,144,168,' + (focus*0.55) + ')';
            ctx.font = Math.round(w*0.09) + 'px ' + MONO_FAMILY;
            ctx.fillText('#' + Math.max(1, score - i), 0, h*0.36);
          }
          ctx.restore();
        }
      }
      ctx.strokeStyle = 'rgba(255,144,168,0.35)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(W/2, 4); ctx.lineTo(W/2, H - 4); ctx.stroke();
      ctx.setLineDash([]);
    });
  }
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

/* ═══ GW LIVE METRICS ═══ */
(function setupGwMetrics(){
  const freqEl = document.getElementById('gw-freq');
  const snrEl  = document.getElementById('gw-snr');
  const dtEl   = document.getElementById('gw-dt');
  if(!freqEl) return;
  let t=0;
  setInterval(()=>{
    t+=0.04;
    const phase = (Math.sin(t*0.7)+1)/2;
    freqEl.textContent = (35 + phase*115).toFixed(0)+' Hz';
    snrEl.textContent  = (7.8 + phase*0.9).toFixed(1);
    dtEl.textContent   = '+'+(0.45 - phase*0.4).toFixed(2)+' s';
  }, 80);
})();

/* ═══ FILTERABLE CATALOG ═══ */
function setupCatalog(){
  const btns  = document.querySelectorAll('.cat-btn');
  const items = document.querySelectorAll('.cat-item');
  const NOISE = '▓░▒█▐▌│┤╡╢╣ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$';

  function scrambleName(el, final, dur){
    if(!el) return;
    const len=final.length; const t0=performance.now();
    (function tick(now){
      const p=Math.min(1,(now-t0)/dur);
      if(p>=1){el.textContent=final;return;}
      let s='';
      const resolved=Math.floor(Math.pow(p,0.6)*len);
      for(let i=0;i<len;i++) s+=(i<resolved||final[i]===' ')?final[i]:NOISE[Math.floor(Math.random()*NOISE.length)];
      el.textContent=s; requestAnimationFrame(tick);
    })(performance.now());
  }

  function filter(cat){
    btns.forEach(b=>b.classList.toggle('active', b.dataset.cat===cat));
    items.forEach((item,idx)=>{
      const cats = (item.dataset.cat||'').split(' ');
      const show = cat==='all' || cats.includes(cat);
      if(show){
        item.classList.remove('hidden');
        const nm = item.querySelector('.cat-nm');
        if(nm){
          const final = nm.dataset.es || nm.textContent;
          setTimeout(()=>scrambleName(nm, final, 260), idx*30);
        }
        item.style.opacity='0'; item.style.transform='translateY(5px)';
        requestAnimationFrame(()=>{
          item.style.transition='opacity .3s ease, transform .3s ease';
          item.style.opacity='1'; item.style.transform='none';
        });
      } else {
        const nm = item.querySelector('.cat-nm');
        if(nm){
          const orig=nm.textContent;
          let i=0; const iv=setInterval(()=>{
            let s=''; for(let c=0;c<orig.length;c++) s+=NOISE[Math.floor(Math.random()*NOISE.length)];
            nm.textContent=s; if(++i>6){clearInterval(iv);item.classList.add('hidden');nm.textContent=orig;}
          },35);
        } else { item.classList.add('hidden'); }
      }
    });
  }

  btns.forEach(btn=>btn.addEventListener('click',()=>filter(btn.dataset.cat)));
  items.forEach(item=>{
    item.addEventListener('click', ()=>item.classList.toggle('open'));
    item.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' ') item.classList.toggle('open'); });
  });
}
setupCatalog();

/* ═══ HUD SCROLL TRACKER ═══ */
(function setupHudScroll(){
  const hudThumb = document.getElementById('hud-scroll-thumb');
  const hudVal = document.getElementById('hud-scroll-val');
  if(!hudThumb || !hudVal) return;

  let scrollTicking = false, isBottom = false;
  window.addEventListener('scroll', () => {
    if(!scrollTicking) {
      requestAnimationFrame(() => {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        let p = maxScroll > 0 ? st / maxScroll : 0;
        p = Math.max(0, Math.min(1, p));
        hudThumb.style.transform = `translateY(calc(${p} * (100vh - 60px)))`;
        if(p >= 0.99) {
          hudVal.innerHTML = '↑'; hudVal.style.fontSize = '16px';
          hudThumb.classList.add('pointer'); isBottom = true;
        } else {
          hudVal.innerHTML = ''; hudThumb.classList.remove('pointer'); isBottom = false;
        }
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  });

  let isDragging = false, hasDragged = false, startY = 0, startScrollTop = 0;

  function startDrag(clientY) {
    isDragging = true; hasDragged = false; startY = clientY;
    startScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
    hudThumb.style.cursor = 'grabbing';
    document.documentElement.style.scrollBehavior = 'auto';
  }
  function doDrag(clientY) {
    if (!isDragging) return;
    const dy = clientY - startY;
    if (Math.abs(dy) > 2) hasDragged = true;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const trackHeight = window.innerHeight - 60;
    if (trackHeight <= 0) return;
    const dp = dy / trackHeight;
    const startP = maxScroll > 0 ? startScrollTop / maxScroll : 0;
    let targetP = Math.max(0, Math.min(1, startP + dp));
    window.scrollTo(0, targetP * maxScroll);
  }
  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = ''; document.body.style.cursor = '';
    hudThumb.style.cursor = '';
    document.documentElement.style.scrollBehavior = '';
  }

  hudThumb.addEventListener('mousedown', (e) => { if (e.button !== 0) return; startDrag(e.clientY); e.preventDefault(); e.stopPropagation(); });
  hudThumb.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; startDrag(e.touches[0].clientY); e.preventDefault(); e.stopPropagation(); }, { passive: false });
  document.addEventListener('mousemove', (e) => { doDrag(e.clientY); });
  document.addEventListener('touchmove', (e) => { if (!isDragging) return; doDrag(e.touches[0].clientY); if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchend', stopDrag);
  hudThumb.addEventListener('click', (e) => {
    if (hasDragged) { e.preventDefault(); e.stopPropagation(); return; }
    if(isBottom) window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
