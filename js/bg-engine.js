'use strict';
/* =============================================================
   bg-engine.js — Background DOM walk, parallax, hover, edit mode,
                  diff engine, autocomplete
   Javier Portfolio
   ============================================================= */

/* ═══ CORE REFS ═══ */
const bgVP   = document.getElementById('bg-viewport');
const bg     = document.getElementById('bg-code');
const page   = document.querySelector('.shell');
const acEl   = document.getElementById('ac');
/* Status element removed from page. Keep stEl/stTxt as detached stubs. */
const stEl   = document.createElement('div');
const stTxt  = document.createElement('span');
stEl.appendChild(stTxt);
const cur    = document.getElementById('cursor');

const IS_TOUCH = matchMedia('(hover:none) and (pointer:coarse)').matches;
if (IS_TOUCH) document.body.classList.add('touch-device');

let _editing    = false;
let _applyTimer = null;
let _diffBaseline = null;
let _diffTimer = null;
let _hasDiff = false;
let _lastEditedText = null;
let _lastValidText = null;
let _diffOriginal = null;
let _revertTimer = null;
let _pageSnapshot = null;
let _diffOriginalCanonical = null;
let _editEntryText = null;

/* ─── lang / theme ─── */
function setLang(l){
  _diffOriginalCanonical = null;
  document.documentElement.dataset.lang = l;
  document.querySelectorAll('[data-es]').forEach(el=>{
    const v = el.getAttribute('data-'+l); if(v!=null) el.innerHTML=v;
  });
  const tl = document.getElementById('hero-tagline');
  if(tl){
    const n = (tl.dataset.variant != null) ? +tl.dataset.variant : 0;
    const v = tl.getAttribute('data-' + l + '-' + n);
    if(v != null) tl.innerHTML = v;
  }
  document.querySelectorAll('.lang button').forEach(b=>b.classList.toggle('on',b.dataset.setLang===l));
  // Re-etiquetar los mosaicos booteados al idioma activo (Req 8.3).
  // Defensivo: los mosaicos pueden no estar hidratados todavia.
  document.querySelectorAll('.proj-vis').forEach(v=>{
    const c = v.__mosaicCtrl;
    if(c && typeof c.relabel === 'function'){ try{ c.relabel(); }catch(e){} }
  });
  renderBg();
  try{ localStorage.setItem('lang-d',l); }catch(e){}
}
function setTheme(t){
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('.theme button').forEach(b=>b.classList.toggle('on',b.dataset.setTheme===t));
  try{ localStorage.setItem('theme-d',t); }catch(e){}
  document.querySelectorAll('.proj-panel.booted').forEach(p=>initVis(p));
}
function setupHeaderControls(){
  document.querySelectorAll('.lang button').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.setLang)));
  document.querySelectorAll('.theme button').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.setTheme)));
}
setupHeaderControls();

/* ─── custom cursor ─── */
document.addEventListener('mousemove', e=>{
  cur.style.left = e.clientX+'px'; cur.style.top = e.clientY+'px';
  const inSlot = e.target.closest('.slot');
  cur.classList.toggle('on',!!inSlot); cur.classList.toggle('full',!!inSlot);
});
document.addEventListener('touchstart',()=>{ cur.style.display='none'; },{once:true});

/* ═══ BG RENDERING ═══ */
const VOID_TAGS = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const KNOWN_TAGS = new Set(['html','head','body','div','span','section','article','header','footer','main','nav','aside','h1','h2','h3','h4','h5','h6','p','a','em','strong','small','mark','ins','del','sub','sup','code','kbd','samp','var','figure','figcaption','time','address','blockquote','cite','q','abbr','dfn','ul','ol','li','dl','dt','dd','table','thead','tbody','tfoot','tr','td','th','caption','col','colgroup','form','label','input','button','select','option','optgroup','textarea','fieldset','legend','datalist','output','progress','meter','img','picture','source','video','audio','track','iframe','canvas','svg','path','circle','rect','line','polygon','polyline','ellipse','g','defs','use','symbol','br','hr','wbr','area','base','link','meta','style','script','noscript','template','slot','summary','details','dialog','menu','hgroup','i','b','u','s','pre','bdo','bdi','ruby','rt','rp','data']);
const ANCHOR_SEL = 'section, article, .commit, .listing .row, .mod-head, .marquee-wrap, .contact-box';

function mkSpan(cls, txt){
  const s = document.createElement('span');
  s.className = cls;
  if(txt != null) s.textContent = txt;
  return s;
}
function openTag(el){
  const live = el.hasAttribute('data-ref');
  const tk = mkSpan(live ? 'tk live' : 'tk');
  if(live) tk.dataset.ref = el.getAttribute('data-ref');
  if(el.matches && el.matches(ANCHOR_SEL)){
    tk.dataset.anchor = 'a' + _anchorEls.length;
    _anchorEls.push(el);
  }
  tk.appendChild(mkSpan('t', '<'));
  tk.appendChild(mkSpan('n', el.tagName.toLowerCase()));
  for(const a of el.attributes){
    let name = a.name;
    let val = a.value;
    if (name === 'data-compile' || name === 'data-compile-dur' || name === 'data-compile-delay' ||
        name === 'data-compiled' || name === 'data-variant' || name === 'data-om-id') continue;
    if (name === 'class') {
      const tokens = val.split(/\s+/).filter(c => c && c !== 'compile-done' && c !== 'booted' && c !== 'morph');
      if (!tokens.length) continue;
      val = tokens.join(' ');
    }
    if (name === 'style') {
      const cleanVal = val.replace(/\s*opacity:\s*[\d.]+;?/g, '').trim();
      if (!cleanVal) continue;
      val = cleanVal;
    }
    tk.appendChild(document.createTextNode(' '));
    tk.appendChild(mkSpan('a', name));
    tk.appendChild(document.createTextNode('='));
    tk.appendChild(mkSpan('v', '"' + val + '"'));
  }
  tk.appendChild(mkSpan('t', '>'));
  return tk;
}
function closeTag(el){
  const tk = mkSpan('tk');
  tk.appendChild(mkSpan('t', '</'));
  tk.appendChild(mkSpan('n', el.tagName.toLowerCase()));
  tk.appendChild(mkSpan('t', '>'));
  return tk;
}
function walkDom(el, depth, frag){
  const pad = '  '.repeat(depth);
  frag.append(document.createTextNode(pad), openTag(el), document.createTextNode('\n'));
  if(VOID_TAGS.test(el.tagName)) return;
  for(const node of el.childNodes){
    if(node.nodeType === 1){
      walkDom(node, depth + 1, frag);
    } else if(node.nodeType === 3){
      const txt = node.nodeValue.replace(/\s+/g, ' ').trim();
      if(txt) frag.append(document.createTextNode('  '.repeat(depth+1)), mkSpan('x', txt), document.createTextNode('\n'));
    } else if(node.nodeType === 8){
      frag.append(document.createTextNode('  '.repeat(depth+1)), mkSpan('c', '<!--' + node.nodeValue + '-->'), document.createTextNode('\n'));
    }
  }
  frag.append(document.createTextNode(pad), closeTag(el), document.createTextNode('\n'));
}

function renderBg(){
  if(_editing) return;
  if(renderBg._scheduled) return;
  renderBg._scheduled = true;
  console.log('[renderBg] scheduled');
  const run = ()=>{
    renderBg._scheduled = false;
    if(_editing) return;
    console.group('%c[renderBg] ─── REBUILDING BG FROM PAGE DOM ───', 'color:#9ec6ee;font-weight:bold');
    _anchorEls = [];
    const frag = document.createDocumentFragment();
    for(const node of page.childNodes){
      if(node.nodeType === 1) walkDom(node, 0, frag);
      else if(node.nodeType === 8) frag.append(mkSpan('c', '<!--' + node.nodeValue + '-->'), document.createTextNode('\n'));
    }
    bg.replaceChildren(frag);
    indexTags();
    computeAnchors();
    kickBg();
    console.log('[renderBg] done — .tk:', bg.querySelectorAll('.tk').length, '.x:', bg.querySelectorAll('.x').length);
    console.groupEnd();
  };
  if(typeof requestIdleCallback === 'function'){
    requestIdleCallback(run, { timeout: 120 });
  } else {
    requestAnimationFrame(run);
  }
}
renderBg._scheduled = false;

/* ─── indexing ─── */
let NODES = [], GA = [], GB = [];
function tagKind(tk){
  const t0 = tk.querySelector('.t');
  if(t0 && t0.textContent.indexOf('/') > -1) return 'close';
  const n = tk.querySelector('.n');
  if(n && VOID_TAGS.test(n.textContent)) return 'void';
  return 'open';
}
function indexTags(){
  NODES = [...bg.querySelectorAll('.tk, .x, .c')];
  const n = NODES.length;
  console.log('[indexTags] indexing', n, 'nodes');
  GA = new Array(n); GB = new Array(n);
  const close = new Array(n), kind = new Array(n), stack = [];
  NODES.forEach((el, i)=>{
    el.dataset.ti = i;
    const k = el.classList.contains('tk') ? tagKind(el) : 'text';
    kind[i] = k;
    if(k === 'open'){ GA[i] = i; stack.push(i); }
    else if(k === 'close'){
      const o = stack.length ? stack.pop() : i;
      close[o] = i; GA[i] = o;
    } else {
      GA[i] = stack.length ? stack[stack.length - 1] : i;
    }
  });
  for(let i = 0; i < n; i++){
    if(kind[i] === 'void'){ GA[i] = i; GB[i] = i; continue; }
    const o = GA[i];
    GB[i] = (close[o] != null) ? close[o] : o;
  }
}

/* ─── lighting ─── */
let _hoverEl = null;
function clearLit(){
  bg.querySelectorAll('.tag-lit').forEach(s=>s.classList.remove('tag-lit'));
  _hoverEl = null;
}
function litGroup(el){
  if(!el) return;
  const i = el.dataset.ti != null ? +el.dataset.ti : -1;
  if(i < 0 || GA[i] == null){ el.classList.add('tag-lit'); return; }
  for(let k = GA[i]; k <= GB[i]; k++) NODES[k] && NODES[k].classList.add('tag-lit');
}
function litOne(el){
  if(!el || !el.classList) return;
  const TOKEN_CLASSES = ['x','tk','c','v','t','n','a'];
  if(!TOKEN_CLASSES.some(c => el.classList.contains(c))){
    if(!litOne._rejectCount) litOne._rejectCount = 0;
    litOne._rejectCount++;
    if(litOne._rejectCount <= 5 || litOne._rejectCount % 20 === 0){
      console.warn('[litOne] rejected element:', el.tagName, el.className);
    }
    return;
  }
  el.classList.add('tag-lit');
}

/* ─── parallax ─── */
let _anchors = [], _anchorEls = [], _bgTarget = 0, _bgCur = 0, _bgRAF = 0, _bgMax = 1;

function computeAnchors(){
  if(!bg.children.length){ _anchors = []; return; }
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  _bgMax = Math.max(1, bg.scrollHeight - window.innerHeight);
  _anchors = [{ p: 0, pb: 0 }];
  const _bgRect = bg.getBoundingClientRect();
  _anchorEls.forEach((el, k)=>{
    const tk = bg.querySelector('.tk[data-anchor="a' + k + '"]');
    if(!tk) return;
    const p  = (el.getBoundingClientRect().top + window.scrollY) / maxScroll;
    const pb = (tk.getBoundingClientRect().top - _bgRect.top) / _bgMax;
    if(p > 0.015 && p < 0.985) _anchors.push({ p: p, pb: pb });
  });
  _anchors.push({ p: 1, pb: 1 });
  _anchors.sort((a,b)=>a.p - b.p);
}
function bgTargetY(){
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const p = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  let a = _anchors[0], b = _anchors[_anchors.length - 1];
  for(let i = 0; i < _anchors.length - 1; i++){
    if(p >= _anchors[i].p){ a = _anchors[i]; b = _anchors[i + 1]; }
  }
  const span = (b.p - a.p) || 1;
  const f = (p - a.p) / span;
  return (a.pb + f * (b.pb - a.pb)) * _bgMax;
}
function bgTick(){
  if(_anchors.length < 2){
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    _bgMax = Math.max(1, bg.scrollHeight - window.innerHeight);
    _bgCur = p * _bgMax;
    bg.style.transform = 'translateY(' + (-_bgCur) + 'px)';
    _bgRAF = requestAnimationFrame(bgTick);
    return;
  }
  _bgTarget = bgTargetY();
  _bgCur += (_bgTarget - _bgCur) * 0.1;
  if(Math.abs(_bgTarget - _bgCur) < 0.4){ _bgCur = _bgTarget; _bgRAF = 0; }
  else { _bgRAF = requestAnimationFrame(bgTick); }
  bg.style.transform = 'translateY(' + (-_bgCur) + 'px)';
  if(acState) positionAC();
}
function kickBg(){
  if(_bgRAF) cancelAnimationFrame(_bgRAF);
  _bgRAF = requestAnimationFrame(bgTick);
}
window.addEventListener('scroll', kickBg, {passive:true});
let _resizeT = 0;
window.addEventListener('resize', ()=>{
  clearTimeout(_resizeT);
  _resizeT = setTimeout(()=>{ computeAnchors(); kickBg(); }, 100);
});

/* ─── hover ─── */
function bgXNear(cx, cy){
  const R = 18;
  const pts = [[0,0],[0,-R],[0,R],[-R,0],[R,0],[-R,-R],[R,-R],[-R,R],[R,R]];
  let best = null, bestD = Infinity;
  const lh = parseFloat(getComputedStyle(bg).lineHeight) || 20;
  let _dbgChecked = 0, _dbgRejected = 0, _dbgNoX = 0;
  for(const [dx,dy] of pts){
    const els = document.elementsFromPoint(cx+dx, cy+dy);
    for(const el of els){
      if(el.classList && (el.classList.contains('x') || el.classList.contains('c')) && bg.contains(el)){
        _dbgChecked++;
        const isComment = el.classList.contains('c');
        const rects = el.getClientRects();
        if(!isComment && rects.length > 4) { _dbgRejected++; break; }
        if(!isComment && el.getBoundingClientRect().height > lh * 3) { _dbgRejected++; break; }
        const d = dx*dx + dy*dy;
        if(d < bestD){ bestD = d; best = el; }
        break;
      }
    }
    if(!best && els.length > 0) _dbgNoX++;
  }
  if(!bgXNear._counter) bgXNear._counter = 0;
  bgXNear._counter++;
  if(bgXNear._counter % 60 === 1){
    console.log('[bgXNear] sample — checked:', _dbgChecked, 'rejected:', _dbgRejected, 'noX:', _dbgNoX, 'found:', !!best);
  }
  return best;
}
function bgPointNear(el, x, y, pad){
  const rs = el.getClientRects();
  for(const r of rs){
    if(x>=r.left-pad && x<=r.right+pad && y>=r.top-pad && y<=r.bottom+pad) return true;
  }
  return false;
}
const LAYOUT_WRAPPER_SEL =
  '.shell, section, header.top, footer.foot, ' +
  '.skills, .proj-panels, .proj-catalog, .modules, .gitlog, ' +
  '.marquee-wrap, .catalog-head, .catalog-filters, .contact-links, ' +
  '.proj-body, .proj-tags, .proj-links, .proj-metrics, .mineralia-stats';
function clickIsContent(e){
  const t = e.target;
  if(!t || !t.closest) return false;
  if(t.closest('#bg-viewport, #bg-code')) return false;
  if(t === document.body || t === document.documentElement) return false;
  if(t.matches && t.matches(LAYOUT_WRAPPER_SEL)) return false;
  return !!t.closest('.shell');
}
if(!IS_TOUCH){
  document.documentElement.addEventListener('mouseleave', ()=>{ if(!_editing) clearLit(); });
  document.addEventListener('mousemove', e=>{
    if(_editing) return;
    if(clickIsContent(e)){ if(_hoverEl) clearLit(); return; }
    if(_hoverEl && bgPointNear(_hoverEl, e.clientX, e.clientY, 22)) return;
    const x = bgXNear(e.clientX, e.clientY);
    if(x === _hoverEl) return;
    clearLit();
    _hoverEl = x;
    if(x) litOne(x);
  });
}

document.addEventListener('selectionchange', ()=>{
  if(!_editing) return;
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount) return;
  let n = sel.getRangeAt(0).startContainer;
  if(n && n.nodeType===3) n = n.parentNode;
  clearLit();
  if(n && bg.contains(n)) {
    litGroup(n.closest('.tk, .x, .c'));
    maybeAC();
    if(acState) positionAC();
  } else {
    hideAC();
  }
});

/* ═══ DIFF ═══ */
const BLOCK = 'a[href], button, input, textarea, select, .slot, .slot *, .lang, .lang *, .theme, .theme *, .badge-open, #ac, #ac *, footer.foot a, #hud-scroll-track, #hud-scroll-track *';

function normalizeForDiff(line){
  return line
    .replace(/\s+data-om-id="[^"]*"/g, '')
    .replace(/\s+data-compiled="[^"]*"/g, '')
    .replace(/\s+style="\s*opacity:\s*[\d.]+;?\s*"/g, '')
    .replace(/(\s)class="([^"]*)"/g, function(_m, sp, content){
      const tokens = content.split(/\s+/).filter(function(c){ return c && c !== 'compile-done'; });
      return tokens.length ? sp + 'class="' + tokens.join(' ') + '"' : '';
    });
}
function normalizeLinesForDiff(lines){
  const out = new Array(lines.length);
  for(let i = 0; i < lines.length; i++) out[i] = normalizeForDiff(lines[i]);
  return out;
}
function computeLineDiff(oldL, newL){
  let pi = 0, si = 0;
  const minLen = Math.min(oldL.length, newL.length);
  while(pi < minLen && oldL[pi] === newL[pi]) pi++;
  while(si < minLen - pi && oldL[oldL.length-1-si] === newL[newL.length-1-si]) si++;
  const prefix = oldL.slice(0, pi).map(t=>({type:'same',text:t}));
  const suffix = si > 0 ? oldL.slice(oldL.length-si).map(t=>({type:'same',text:t})) : [];
  const a = oldL.slice(pi, si > 0 ? oldL.length-si : undefined);
  const b = newL.slice(pi, si > 0 ? newL.length-si : undefined);
  if(!a.length && !b.length) return prefix.concat(suffix);
  if(!a.length) return prefix.concat(b.map(t=>({type:'add',text:t})),suffix);
  if(!b.length) return prefix.concat(a.map(t=>({type:'del',text:t})),suffix);
  const M = a.length, N = b.length;
  if(M*N > 2000000) return prefix.concat(a.map(t=>({type:'del',text:t})),b.map(t=>({type:'add',text:t})),suffix);
  const dp = Array.from({length:M+1},()=>new Uint16Array(N+1));
  for(let i=1;i<=M;i++) for(let j=1;j<=N;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1]);
  const mid = [];
  let i=M, j=N;
  while(i>0||j>0){
    if(i>0&&j>0&&a[i-1]===b[j-1]){ mid.push({type:'same',text:a[i-1]}); i--;j--; }
    else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){ mid.push({type:'add',text:b[j-1]}); j--; }
    else { mid.push({type:'del',text:a[i-1]}); i--; }
  }
  mid.reverse();
  return prefix.concat(mid, suffix);
}

function escDiff(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderDiff(){
  if(!_editing || !_diffOriginal) return;
  const currentLines = bg.textContent.split('\n');
  const diff = computeLineDiff(
    normalizeLinesForDiff(_diffOriginal),
    normalizeLinesForDiff(currentLines));
  let adds = 0, dels = 0;
  diff.forEach(d=>{ if(d.type==='add') adds++; if(d.type==='del') dels++; });
  _hasDiff = adds > 0 || dels > 0;
  console.log('[renderDiff] live diff: +' + adds + ' -' + dels);
  updateDiffStatus(adds, dels);
}

function diffBaselineCanonical(){
  if(_diffOriginalCanonical) { console.log('[diffBaselineCanonical] returning cached'); return _diffOriginalCanonical; }
  if(!_diffOriginal) return null;
  console.log('[diffBaselineCanonical] computing canonical');
  try{
    const text = _diffOriginal.join('\n');
    const doc = new DOMParser().parseFromString('<div id="__r">' + text + '</div>', 'text/html');
    const root = doc.getElementById('__r');
    if(!root) return _diffOriginal;
    const serialized = root.innerHTML;
    const probe2 = document.createElement('div');
    probe2.innerHTML = serialized;
    const _cbl = document.documentElement.dataset.lang || 'es';
    probe2.querySelectorAll('[data-es]').forEach(function(el){
      const v = el.getAttribute('data-' + _cbl); if(v != null) el.innerHTML = v;
    });
    probe2.querySelectorAll('[data-compile]').forEach(function(el){
      el.dataset.compiled = '1'; el.style.opacity = '1'; el.classList.add('compile-done');
    });
    const savedAnchors = _anchorEls;
    _anchorEls = [];
    const tmp = document.createDocumentFragment();
    for(const node of probe2.childNodes){
      if(node.nodeType === 1) walkDom(node, 0, tmp);
      else if(node.nodeType === 8) tmp.append(mkSpan('c', '<!--' + node.nodeValue + '-->'), document.createTextNode('\n'));
    }
    _anchorEls = savedAnchors;
    const probe = document.createElement('pre');
    probe.appendChild(tmp);
    _diffOriginalCanonical = probe.textContent.split('\n');
    console.log('[diffBaselineCanonical] computed canonical lines:', _diffOriginalCanonical.length);
    return _diffOriginalCanonical;
  }catch(e){
    return _diffOriginal;
  }
}

function renderDiffPersist(){
  console.group('%c[renderDiffPersist] ─── BUILDING DIFF OVERLAY ───', 'color:#e8b87a;font-weight:bold');
  if(!_diffOriginal) { console.log('ABORT: no _diffOriginal'); console.groupEnd(); return; }

  _anchorEls = [];
  const tmp = document.createDocumentFragment();
  for(const node of page.childNodes){
    if(node.nodeType === 1) walkDom(node, 0, tmp);
    else if(node.nodeType === 8) tmp.append(mkSpan('c', '<!--' + node.nodeValue + '-->'), document.createTextNode('\n'));
  }
  const newRows = [];
  const newRowText = [];
  let cur2 = document.createDocumentFragment();
  let curText = '';
  for(const n of Array.from(tmp.childNodes)){
    if(n.nodeType === 3 && n.nodeValue === '\n'){
      newRows.push(cur2);
      newRowText.push(curText);
      cur2 = document.createDocumentFragment();
      curText = '';
    } else {
      curText += n.textContent;
      cur2.appendChild(n);
    }
  }
  if(cur2.childNodes.length){ newRows.push(cur2); newRowText.push(curText); }

  const baseline = diffBaselineCanonical() || _diffOriginal;
  const _bn = normalizeLinesForDiff(baseline);
  const _nn = normalizeLinesForDiff(newRowText);
  console.log('[renderDiffPersist] baseline lines:', baseline.length, 'newRowText lines:', newRowText.length);
  const diff = computeLineDiff(_bn, _nn);
  let adds = 0, dels = 0;
  diff.forEach(d => { if(d.type === 'add') adds++; if(d.type === 'del') dels++; });
  console.log('[renderDiffPersist] diff result: +' + adds + ' -' + dels);

  _lastEditedText = newRowText.join('\n');

  if(adds === 0 && dels === 0){
    _hasDiff = false;
    const plain = document.createDocumentFragment();
    for(const r of newRows){ plain.appendChild(r); plain.appendChild(document.createTextNode('\n')); }
    bg.replaceChildren(plain);
    indexTags(); computeAnchors(); kickBg();
    updateDiffStatus(0, 0);
    console.groupEnd();
    return;
  }
  _hasDiff = true;

  const out = document.createDocumentFragment();
  let newIdx = 0;
  for(const d of diff){
    const row = document.createElement('div');
    row.className = 'diff-line' + (d.type === 'add' ? ' diff-add' : d.type === 'del' ? ' diff-del' : '');
    if(d.type !== 'same'){
      const gutter = document.createElement('span');
      gutter.className = 'diff-gutter';
      gutter.textContent = d.type === 'add' ? '+' : '\u2212';
      row.appendChild(gutter);
    }
    if(d.type === 'del'){
      const holder = document.createElement('span');
      holder.innerHTML = tokenizeLine(d.text);
      while(holder.firstChild) row.appendChild(holder.firstChild);
    } else if(newIdx < newRows.length){
      row.appendChild(newRows[newIdx]);
      newIdx++;
    } else {
      row.appendChild(document.createTextNode(d.text));
      newIdx++;
    }
    row.appendChild(document.createTextNode('\n'));
    out.appendChild(row);
  }
  bg.replaceChildren(out);
  indexTags(); computeAnchors(); kickBg();
  updateDiffStatus(adds, dels);
  console.log('[renderDiffPersist] DONE — .diff-line:', bg.querySelectorAll('.diff-line').length);
  console.groupEnd();
}

function tokenizeLine(text){
  let html = '';
  let pos = 0;
  const len = text.length;
  while(pos < len){
    if(text.startsWith('<!--', pos)){
      const end = text.indexOf('-->', pos + 4);
      const stop = end < 0 ? len : end + 3;
      html += '<span class="c">' + escDiff(text.slice(pos, stop)) + '</span>';
      pos = stop; continue;
    }
    if(text[pos] === '<'){
      const closing = text[pos + 1] === '/';
      let j = pos + 1 + (closing ? 1 : 0);
      const nameStart = j;
      while(j < len && /[a-zA-Z0-9-]/.test(text[j])) j++;
      const name = text.slice(nameStart, j);
      if(name){
        let tk = '<span class="tk"><span class="t">' + (closing ? '&lt;/' : '&lt;') + '</span><span class="n">' + escDiff(name) + '</span>';
        while(j < len && text[j] !== '>'){
          if(text[j] === ' ' || text[j] === '\t'){ tk += text[j]; j++; continue; }
          if(text[j] === '/'){ tk += '/'; j++; continue; }
          const aStart = j;
          while(j < len && /[a-zA-Z0-9_:-]/.test(text[j])) j++;
          const aName = text.slice(aStart, j);
          if(aName){
            tk += '<span class="a">' + escDiff(aName) + '</span>';
            if(text[j] === '='){
              tk += '='; j++;
              if(text[j] === '"' || text[j] === "'"){
                const q = text[j]; let k = j + 1;
                while(k < len && text[k] !== q) k++;
                const vEnd = k < len ? k + 1 : k;
                tk += '<span class="v">' + escDiff(text.slice(j, vEnd)) + '</span>';
                j = vEnd;
              } else {
                const vStart = j;
                while(j < len && !/[ \t>/]/.test(text[j])) j++;
                if(j > vStart) tk += '<span class="v">' + escDiff(text.slice(vStart, j)) + '</span>';
              }
            }
          } else { tk += escDiff(text[j]); j++; }
        }
        if(j < len && text[j] === '>'){ tk += '<span class="t">&gt;</span></span>'; j++; }
        else { tk += '</span>'; }
        html += tk; pos = j; continue;
      }
    }
    const next = text.indexOf('<', pos);
    const stop = next < 0 ? len : next;
    const slice = text.slice(pos, stop);
    if(slice){
      if(slice.trim().length){ html += '<span class="x">' + escDiff(slice) + '</span>'; }
      else { html += escDiff(slice); }
    }
    pos = stop;
  }
  return html;
}

function updateDiffStatus(adds, dels){
  const lang = document.documentElement.dataset.lang||'es';
  if(adds === 0 && dels === 0){
    stEl.classList.remove('has-diff');
    stTxt.textContent = lang==='en' ? 'no changes' : 'sin cambios';
  } else {
    stEl.classList.add('has-diff');
    stTxt.textContent = '+' + adds + ' \u2212' + dels;
  }
  stEl.classList.remove('err');
}

function clearDiff(full){
  _hasDiff = false; _diffBaseline = null; clearTimeout(_diffTimer);
  if(full){ _diffOriginal = null; _diffOriginalCanonical = null; _lastEditedText = null; }
  stEl.classList.remove('has-diff');
  const lang = document.documentElement.dataset.lang||'es';
  stTxt.textContent = lang==='en' ? 'no changes' : 'sin cambios';
}

/* ─── EDIT MODE ─── */
function enterEdit(cx, cy){
  if(IS_TOUCH||_editing) return;
  console.group('%c[enterEdit] ─── ENTERING EDIT MODE ───', 'color:#7adfc8;font-weight:bold');
  let targetLineIdx = -1;
  let hit = null;
  if(_hasDiff && _lastEditedText && cx != null){
    const findDiffLineAt = (x, y) => {
      if(document.elementsFromPoint){
        const els = document.elementsFromPoint(x, y);
        for(const el of els){
          if(el && el.classList && el.classList.contains('diff-line') && bg.contains(el)) return el;
        }
      }
      const t = document.elementFromPoint(x, y);
      return (t && t.closest) ? t.closest('.diff-line') : null;
    };
    hit = findDiffLineAt(cx, cy);
    if(hit && bg.contains(hit)){
      const allLines = bg.querySelectorAll('.diff-line');
      let textIdx = 0;
      for(const line of allLines){
        if(line === hit){ targetLineIdx = textIdx; break; }
        if(!line.classList.contains('diff-del')) textIdx++;
      }
    }
  }

  _editing = true;
  document.body.classList.add('in-edit');
  _pageSnapshot = page.innerHTML;

  if(_hasDiff && _lastEditedText){
    const _hitVisualY = (hit && bg.contains(hit)) ? hit.getBoundingClientRect().top : null;
    _anchorEls = [];
    const _frag = document.createDocumentFragment();
    for(const _n of page.childNodes){
      if(_n.nodeType === 1) walkDom(_n, 0, _frag);
      else if(_n.nodeType === 8) _frag.append(mkSpan('c', '<!--' + _n.nodeValue + '-->'), document.createTextNode('\n'));
    }
    bg.replaceChildren(_frag);
    indexTags(); computeAnchors();
    if(_hitVisualY !== null && targetLineIdx >= 0){
      let _wl = 0, _firstEl = null;
      for(const _n of bg.childNodes){
        if(_n.nodeType === 3 && _n.nodeValue === '\n'){ _wl++; if(_wl > targetLineIdx) break; continue; }
        if(_wl === targetLineIdx && _n.nodeType === 1){ _firstEl = _n; break; }
      }
      if(_firstEl){
        const _newVisualY = _firstEl.getBoundingClientRect().top;
        const _delta = _newVisualY - _hitVisualY;
        if(_delta !== 0){ _bgCur += _delta; bg.style.transform = 'translateY(' + (-_bgCur) + 'px)'; }
      }
    }
  }

  _hasDiff = false;
  stEl.classList.remove('has-diff');
  clearTimeout(_diffTimer);
  bg.setAttribute('contenteditable','plaintext-only');
  bgVP.style.pointerEvents = 'auto';
  bg.focus({preventScroll:true});

  if(!_diffOriginal) {
    _diffOriginal = bg.textContent.split('\n');
    console.warn('[enterEdit] *** _diffOriginal CAPTURED ***');
  }
  _editEntryText = bg.textContent;
  console.groupEnd();

  if(targetLineIdx >= 0){
    requestAnimationFrame(()=>{
      try{
        let _walkLine = 0, _firstEl = null, _prevEl = null;
        for(const _n of bg.childNodes){
          if(_n.nodeType === 3 && _n.nodeValue === '\n'){ _walkLine++; if(_walkLine > targetLineIdx) break; continue; }
          if(_n.nodeType !== 1) continue;
          if(_walkLine === targetLineIdx){ _firstEl = _n; break; }
          _prevEl = _n;
        }
        const _ref = _firstEl || _prevEl;
        if(!_ref) return;
        const _rr = _ref.getBoundingClientRect();
        const _lh = parseFloat(getComputedStyle(bg).lineHeight) || 20;
        const ny = _firstEl ? _rr.top + _rr.height / 2 : _rr.bottom + _lh / 2;
        let range = null;
        if(document.caretPositionFromPoint){
          const p = document.caretPositionFromPoint(cx, ny);
          if(p && bg.contains(p.offsetNode) && p.offsetNode !== bg){
            range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true);
          }
        } else if(document.caretRangeFromPoint){
          const rr = document.caretRangeFromPoint(cx, ny);
          if(rr && bg.contains(rr.startContainer) && rr.startContainer !== bg) range = rr;
        }
        if(!range && _ref){
          const _w = document.createTreeWalker(_ref, NodeFilter.SHOW_TEXT, null);
          const _tn = _w.nextNode();
          if(_tn){ range = document.createRange(); range.setStart(_tn, 0); range.collapse(true); }
        }
        if(!range){ range = document.createRange(); range.selectNodeContents(bg); range.collapse(false); }
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
      }catch(e){}
    });
  } else if(cx != null){
    requestAnimationFrame(()=>{
      try{
        function _probe(_cx, _cy){
          if(document.caretPositionFromPoint){
            const _p = document.caretPositionFromPoint(_cx, _cy);
            if(_p && bg.contains(_p.offsetNode) && _p.offsetNode !== bg){
              const _r = document.createRange(); _r.setStart(_p.offsetNode, _p.offset); _r.collapse(true); return _r;
            }
          } else if(document.caretRangeFromPoint){
            const _rr = document.caretRangeFromPoint(_cx, _cy);
            if(_rr && bg.contains(_rr.startContainer) && _rr.startContainer !== bg) return _rr;
          }
          return null;
        }
        let range = _probe(cx, cy);
        if(!range){ const _w = window.innerWidth; for(let _x = 16; _x < _w && !range; _x += 28) range = _probe(_x, cy); }
        if(!range){
          let _bestSpan = null, _best = Infinity;
          for(const _sp of bg.querySelectorAll('.tk, .x, .c')){
            const _r2 = _sp.getBoundingClientRect();
            const _dy = Math.max(0, _r2.top - cy, cy - _r2.bottom);
            const _dx = Math.max(0, _r2.left - cx, cx - _r2.right);
            const _d  = _dy * 100 + _dx;
            if(_d < _best){ _best = _d; _bestSpan = _sp; }
          }
          if(_bestSpan){
            const _sr = _bestSpan.getBoundingClientRect();
            const _cx2 = Math.max(_sr.left + 1, Math.min(cx, _sr.right - 1));
            const _cy2 = _sr.top + _sr.height / 2;
            range = _probe(_cx2, _cy2);
            if(!range){
              const _tw = document.createTreeWalker(_bestSpan, NodeFilter.SHOW_TEXT, null);
              const _tn = _tw.nextNode();
              if(_tn){ range = document.createRange(); range.setStart(_tn, 0); range.collapse(true); }
            }
          }
        }
        if(!range){ range = document.createRange(); range.selectNodeContents(bg); range.collapse(false); }
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
      }catch(e){ console.error('[enterEdit] caret placement failed:', e); }
    });
  }
  renderDiff();
}

function exitEdit(){
  if(!_editing) return;
  console.group('%c[exitEdit] ─── EXITING EDIT MODE ───', 'color:#ff6e7e;font-weight:bold');
  _editing = false;
  document.body.classList.remove('in-edit');
  clearLit();
  bg.removeAttribute('contenteditable');
  bgVP.style.pointerEvents = '';
  hideAC();
  clearTimeout(_applyTimer); clearTimeout(_diffTimer); clearTimeout(_revertTimer);
  stEl.classList.remove('err');
  bgVP.style.animation = 'none'; bg.style.animation = 'none';
  void bgVP.offsetWidth;
  bgVP.style.animation = ''; bg.style.animation = '';

  const noActualEdit = (_editEntryText !== null && bg.textContent === _editEntryText);
  _editEntryText = null;
  if(noActualEdit){
    if(_diffOriginal && _lastEditedText){
      const baseline = diffBaselineCanonical() || _diffOriginal;
      const lines = _lastEditedText.split('\n');
      const diff = computeLineDiff(normalizeLinesForDiff(baseline), normalizeLinesForDiff(lines));
      let adds = 0, dels = 0;
      diff.forEach(d => { if(d.type === 'add') adds++; if(d.type === 'del') dels++; });
      if(adds || dels){ _hasDiff = true; renderDiffPersist(); console.groupEnd(); return; }
    }
    _hasDiff = false; clearDiff(false); console.groupEnd(); return;
  }

  const valid = tryApply();
  if(valid){
    _lastEditedText = bg.textContent;
    if(_diffOriginal){
      const baseline = diffBaselineCanonical() || _diffOriginal;
      const diff = computeLineDiff(normalizeLinesForDiff(baseline), normalizeLinesForDiff(_lastEditedText.split('\n')));
      let adds = 0, dels = 0;
      diff.forEach(d => { if(d.type === 'add') adds++; if(d.type === 'del') dels++; });
      if(adds || dels){ _hasDiff = true; renderDiffPersist(); }
      else { _hasDiff = false; clearDiff(false); setTimeout(renderBg, 120); }
    } else { _hasDiff = false; setTimeout(renderBg, 120); }
  } else {
    _anchorEls = [];
    const _rbFrag = document.createDocumentFragment();
    for(const _n of page.childNodes){
      if(_n.nodeType === 1) walkDom(_n, 0, _rbFrag);
      else if(_n.nodeType === 8) _rbFrag.append(mkSpan('c', '<!--' + _n.nodeValue + '-->'), document.createTextNode('\n'));
    }
    bg.replaceChildren(_rbFrag); indexTags(); computeAnchors(); kickBg();
    if(_diffOriginal){
      const baseline = diffBaselineCanonical() || _diffOriginal;
      const currentLines = bg.textContent.split('\n');
      const diff = computeLineDiff(normalizeLinesForDiff(baseline), normalizeLinesForDiff(currentLines));
      let adds = 0, dels = 0;
      diff.forEach(d => { if(d.type === 'add') adds++; if(d.type === 'del') dels++; });
      if(adds || dels){ _hasDiff = true; renderDiffPersist(); }
      else { _hasDiff = false; clearDiff(false); }
    } else { clearDiff(false); }
    const lang = document.documentElement.dataset.lang || 'es';
    setStatus('err', lang === 'en' ? 'reverted' : 'revertido');
    setTimeout(() => {
      stEl.classList.remove('err');
      if(!_hasDiff) stTxt.textContent = lang === 'en' ? 'no changes' : 'sin cambios';
    }, 1200);
  }
  console.groupEnd();
}

function clickIsCodeSurface(e){
  const t = e.target;
  if(t.closest && t.closest('#bg-viewport, #bg-code .tk, #bg-code .x, #bg-code .c')) return true;
  if(t === document.body || t === document.documentElement) return true;
  if(t.matches && t.matches(LAYOUT_WRAPPER_SEL)) return true;
  return false;
}

document.addEventListener('mousedown', e=>{
  if(IS_TOUCH) return;
  if(_editing){
    if(e.target.closest('#ac')) return;
    hideAC();
    if(!bg.contains(e.target) && !e.target.closest('#bg-code')){ exitEdit(); }
    return;
  }
  if(e.target.closest(BLOCK)) return;
  if(!clickIsCodeSurface(e)) return;
  enterEdit(e.clientX, e.clientY);
});

function discardAndExit(){
  if(!_editing) return;
  _editing = false;
  document.body.classList.remove('in-edit');
  clearLit();
  bg.removeAttribute('contenteditable');
  bgVP.style.pointerEvents = '';
  hideAC();
  clearTimeout(_applyTimer); clearTimeout(_diffTimer); clearTimeout(_revertTimer);
  stEl.classList.remove('err');
  bgVP.style.animation = 'none'; bg.style.animation = 'none';
  void bgVP.offsetWidth;
  bgVP.style.animation = ''; bg.style.animation = '';
  if(_pageSnapshot != null){
    page.innerHTML = _pageSnapshot;
    const _l = document.documentElement.dataset.lang || 'es';
    document.querySelectorAll('[data-es]').forEach(el => {
      const v = el.getAttribute('data-' + _l); if(v != null) el.innerHTML = v;
    });
    document.querySelectorAll('[data-compile]').forEach(el => {
      el.dataset.compiled = '1'; el.style.opacity = '1'; el.classList.add('compile-done');
    });
    reBootPanels();
  }
  _pageSnapshot = null;
  clearDiff(true); _editEntryText = null; _hasDiff = false;
  const lang = document.documentElement.dataset.lang || 'es';
  setStatus('err', lang === 'en' ? 'discarded' : 'descartado');
  setTimeout(() => {
    stEl.classList.remove('err');
    stTxt.textContent = lang === 'en' ? 'no changes' : 'sin cambios';
  }, 1200);
  setTimeout(renderBg, 0);
}

document.addEventListener('keydown', e=>{
  if(!_editing) return;
  if(e.key === 'Escape'){ e.preventDefault(); discardAndExit(); }
  else if(e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
    e.preventDefault(); e.stopPropagation(); exitEdit();
  }
});

/* ─── live apply ─── */
function setStatus(st, msg){
  stEl.classList.toggle('err', st==='err');
  stTxt.textContent = msg||(st==='err'?'error':'ok');
}

let _hwObserver = null;
function initWaveform(){
  if(_hwObserver){ _hwObserver.disconnect(); _hwObserver = null; }
  const hwWrap = document.querySelector('.hero-waveform');
  const hwSig  = document.getElementById('hw-signal');
  if(!hwWrap || !hwSig) return;
  let ph=0, isHover=false, hoverT=0;
  hwWrap.addEventListener('mouseenter', ()=>isHover=true);
  hwWrap.addEventListener('mouseleave', ()=>isHover=false);
  let isVisible=false, isPlaying=false;
  _hwObserver = new IntersectionObserver(function(e){
    isVisible = e[0].isIntersecting;
    if(isVisible && !isPlaying){
      isPlaying = true;
      requestAnimationFrame(function wfTick(){
        if(!isVisible){ isPlaying=false; return; }
        hoverT += (isHover ? 0.08 : -0.05);
        hoverT = Math.max(0, Math.min(1, hoverT));
        const W=1200, H=28, cx=H/2;
        const pts=[];
        for(let x=0; x<=W; x+=4){
          const t=x/W;
          const freq=2+t*(8+hoverT*16);
          const wave1=Math.sin(ph+t*Math.PI*2*freq);
          const wave2=Math.sin(ph*1.3+t*Math.PI*4*freq)*(0.15+hoverT*0.25);
          const amp=cx*0.55*(0.2+t*0.8)*(1+hoverT*0.4);
          const y=cx+(wave1+wave2)*amp;
          pts.push((x===0?'M':'L')+x+','+y.toFixed(1));
        }
        hwSig.setAttribute('d', pts.join(' '));
        ph -= (0.04+hoverT*0.08);
        requestAnimationFrame(wfTick);
      });
    }
  }, {threshold:0});
  _hwObserver.observe(hwWrap);
}

function reBootPanels(){
  initWaveform();
  setupHeaderControls();
  setupCatalog();
  document.querySelectorAll('.proj-panel').forEach(panel=>{
    if(panel.classList.contains('booted')){
      const canvas=panel.querySelector('.proj-canvas');
      if(canvas && canvas.getContext) initVis(panel);
    } else {
      const pio=new IntersectionObserver(entries=>entries.forEach(e=>{
        if(!e.isIntersecting) return;
        const p=e.target;
        const fill=p.querySelector('.proj-boot-fill');
        if(fill){ requestAnimationFrame(()=>{ fill.style.width='100%'; }); }
        setTimeout(()=>{ p.classList.add('booted'); initVis(p); },440);
        pio.unobserve(p);
      }),{threshold:0, rootMargin:'0px 0px -10% 0px'});
      pio.observe(panel);
    }
  });
}

function revertBgFromPage(){
  if(!_editing) return;
  let caretOffset = -1;
  try{
    const sel = window.getSelection();
    if(sel && sel.rangeCount){
      const r = sel.getRangeAt(0);
      if(bg.contains(r.startContainer)){
        const pre = document.createRange();
        pre.selectNodeContents(bg);
        pre.setEnd(r.startContainer, r.startOffset);
        caretOffset = pre.toString().length;
      }
    }
  }catch(_){}
  _anchorEls = [];
  const _f = document.createDocumentFragment();
  for(const _n of page.childNodes){
    if(_n.nodeType === 1) walkDom(_n, 0, _f);
    else if(_n.nodeType === 8) _f.append(mkSpan('c', '<!--' + _n.nodeValue + '-->'), document.createTextNode('\n'));
  }
  bg.replaceChildren(_f); indexTags(); computeAnchors(); kickBg();
  if(caretOffset >= 0){
    try{
      const text = bg.textContent;
      const target = Math.min(caretOffset, text.length);
      const walker = document.createTreeWalker(bg, NodeFilter.SHOW_TEXT, null);
      let count = 0, node;
      while((node = walker.nextNode())){
        const len = node.nodeValue.length;
        if(count + len >= target){
          const range = document.createRange();
          range.setStart(node, target - count); range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range); break;
        }
        count += len;
      }
    }catch(_){}
  }
  renderDiff();
  const lang = document.documentElement.dataset.lang || 'es';
  setStatus('err', lang === 'en' ? 'reverted' : 'revertido');
  setTimeout(() => { stEl.classList.remove('err'); renderDiff(); }, 900);
}

function scheduleRevertIfStillInvalid(){
  clearTimeout(_revertTimer);
  _revertTimer = setTimeout(() => {
    if(!_editing) return;
    if(tryApply()) return;
    revertBgFromPage();
  }, 1200);
}

function tryApply(){
  const text = bg.innerText.trim();
  if(!text) return false;
  try{
    const stripped = text.replace(/="[^"]*"/g, '=""').replace(/='[^']*'/g, "=''");
    const tagNames = [...stripped.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1].toLowerCase());
    for(const tn of tagNames){
      if(!KNOWN_TAGS.has(tn)){ setStatus('err','unknown tag'); return false; }
    }
    const doc = new DOMParser().parseFromString(`<div id="__r">${text}</div>`,'text/html');
    const root = doc.getElementById('__r');
    if(!root||!root.children.length){ setStatus('err','no elements'); return false; }
    for(const n of root.childNodes){
      if(n.nodeType === 3 && n.nodeValue.trim().length > 0){ setStatus('err','loose text'); return false; }
    }
    if(root.querySelector('script,iframe,object,embed')){ setStatus('err','forbidden'); return false; }
    const serialized = root.innerHTML;
    const inputTags = (stripped.match(/<[a-zA-Z][^>]*>/g) || []).length;
    const parsedEls = root.querySelectorAll('*').length;
    if(inputTags > 0 && parsedEls > inputTags * 2 + 5){ setStatus('err','malformed'); return false; }
    const opens = (stripped.match(/<([a-zA-Z][a-zA-Z0-9]*)\b[^/]*?>/g) || []).filter(t => !VOID_TAGS.test(t.match(/<([a-zA-Z]+)/)[1]));
    const closes = (stripped.match(/<\/[a-zA-Z][a-zA-Z0-9]*\s*>/g) || []);
    if(Math.abs(opens.length - closes.length) > 1){ setStatus('err','unclosed'); return false; }
    let temp = stripped.replace(/<!--[\s\S]*?-->/g, '');
    let lastIdx = 0;
    while((lastIdx = temp.indexOf('<', lastIdx)) !== -1){
      const nextClose = temp.indexOf('>', lastIdx);
      if(nextClose === -1){ setStatus('err','unclosed tag'); return false; }
      const nextOpen = temp.indexOf('<', lastIdx + 1);
      if(nextOpen !== -1 && nextOpen < nextClose){ setStatus('err','malformed tag'); return false; }
      lastIdx = nextClose + 1;
    }
    const _wereCompiled = new Set();
    document.querySelectorAll('[data-compile]').forEach(function(el){
      if(el.dataset.compiled === '1' || el.classList.contains('compile-done')){
        const _k = el.tagName + '|' + (el.getAttribute('data-compile-delay') || '')
          + '|' + (el.getAttribute('data-es') || '') + '|' + (el.textContent || '').slice(0, 60);
        _wereCompiled.add(_k);
      }
    });
    const prevHTML = page.innerHTML;
    page.innerHTML = serialized;
    if(!page.children.length){ page.innerHTML = prevHTML; setStatus('err','empty'); return false; }
    if(!_hasDiff) setStatus('ok', document.documentElement.dataset.lang==='en'?'applied':'aplicado');
    document.querySelectorAll('[data-es]').forEach(el=>{
      const l = document.documentElement.dataset.lang;
      const v = el.getAttribute('data-'+l); if(v!=null) el.innerHTML=v;
    });
    document.querySelectorAll('[data-compile]').forEach(function(el){
      const _k = el.tagName + '|' + (el.getAttribute('data-compile-delay') || '')
        + '|' + (el.getAttribute('data-es') || '') + '|' + (el.textContent || '').slice(0, 60);
      if(_wereCompiled.has(_k)){
        el.dataset.compiled = '1'; el.style.opacity = '1'; el.classList.add('compile-done');
      } else if(typeof window.__rearm_compile === 'function'){
        window.__rearm_compile(el);
      } else {
        el.style.opacity = '1';
      }
    });
    reBootPanels();
    _lastValidText = text;
    return true;
  }catch(e){ setStatus('err','parse'); return false; }
}

bg.addEventListener('input', ()=>{
  maybeAC();
  clearTimeout(_revertTimer);
  clearTimeout(_applyTimer);
  _applyTimer = setTimeout(() => {
    const ok = tryApply();
    if(ok){ clearTimeout(_revertTimer); }
    else { clearTimeout(_diffTimer); scheduleRevertIfStillInvalid(); }
  }, 400);
  clearTimeout(_diffTimer);
  _diffTimer = setTimeout(renderDiff, 450);
});

/* ─── autocomplete ─── */
const AC_TAGS    = ['h1','h2','h3','h4','p','span','em','strong','a','div','section','article','small','mark','figure','time'];
let acClasses    = [];
let acState      = null;
let acIdx        = 0;
let _acHideT     = 0;

function setAccent(c){
  document.documentElement.style.setProperty('--accent', c);
  try{ localStorage.setItem('accent-d', c); }catch(e){}
}
const PRESETS = [
  { label:'teal',   hint:'accent', run:()=>setAccent('#7adfc8') },
  { label:'amber',  hint:'accent', run:()=>setAccent('#e8a838') },
  { label:'violet', hint:'accent', run:()=>setAccent('#b49cff') },
  { label:'rose',   hint:'accent', run:()=>setAccent('#ff90a8') },
  { label:'blue',   hint:'accent', run:()=>setAccent('#6fb2f0') },
  { label:'dark',   hint:'theme',  run:()=>setTheme('dark') },
  { label:'light',  hint:'theme',  run:()=>setTheme('light') },
];

function gatherClasses(){
  const s = new Set();
  document.querySelectorAll('[class]').forEach(el=>el.classList.forEach(c=>s.add(c)));
  acClasses = [...s].sort();
}

function caretRect(){
  const sel=window.getSelection(); if(!sel.rangeCount) return null;
  const r=sel.getRangeAt(0).cloneRange(); const rr=r.getClientRects();
  if(rr[0]) return rr[0];
  const sp=document.createElement('span'); sp.appendChild(document.createTextNode('\u200b'));
  r.insertNode(sp); const rc=sp.getBoundingClientRect(); sp.remove(); return rc;
}
function textBefore(){
  const sel=window.getSelection(); if(!sel.rangeCount) return '';
  const r=sel.getRangeAt(0), pre=r.cloneRange();
  pre.selectNodeContents(bg); pre.setEnd(r.endContainer,r.endOffset);
  return pre.toString();
}

function maybeAC(){
  const txt = textBefore();
  let m = /::([a-zA-Z-]*)$/.exec(txt);
  if(m){
    const pf=m[1].toLowerCase();
    const items=PRESETS.filter(p=>p.label.toLowerCase().startsWith(pf));
    if(!items.length){ hideAC(); return; }
    showAC('preset', m[1], items); return;
  }
  m = /<([a-zA-Z][a-zA-Z0-9]*)$/.exec(txt);
  if(m){
    const pf=m[1], items=AC_TAGS.filter(t=>t.startsWith(pf.toLowerCase()));
    if(!items.length){ hideAC(); return; }
    showAC('tag', pf, items.map(t=>({label:t,hint:'tag'}))); return;
  }
  m = /class=("|&quot;)([^"&]*)$/.exec(txt);
  if(m){
    const last=(m[2].split(/\s+/).pop()||'');
    const items=acClasses.filter(c=>c.toLowerCase().startsWith(last.toLowerCase())).slice(0,16);
    if(!items.length){ hideAC(); return; }
    showAC('class', last, items.map(c=>({label:c,hint:'class'}))); return;
  }
  hideAC();
}

function positionAC(){
  const rect = caretRect(); if(!rect) return;
  const w = acEl.offsetWidth || 184, h = acEl.offsetHeight || 120;
  let left = rect.left + 2, top = rect.bottom + 6;
  if(left + w > window.innerWidth  - 10) left = window.innerWidth  - 10 - w;
  if(top  + h > window.innerHeight - 10) top  = rect.top - 6 - h;
  acEl.style.left = Math.max(10, left) + 'px';
  acEl.style.top  = Math.max(10, top)  + 'px';
}
function showAC(kind, prefix, items){
  acState={kind,prefix,items}; acIdx=0;
  clearTimeout(_acHideT); renderAC();
  acEl.hidden=false; positionAC();
  requestAnimationFrame(()=>{ if(acState) acEl.classList.add('show'); });
}
function renderAC(){
  const head = acState.kind==='tag' ? '&lt;tag&gt;' : acState.kind==='preset' ? ':: preset' : 'class';
  acEl.innerHTML = `<div class="ac-h">${head}</div>`
    + acState.items.map((it,i)=>`<div class="ac-i${i===acIdx?' on':''}" data-i="${i}"><span class="lbl">${it.label}</span><span class="hint">${it.hint}</span></div>`).join('');
  acEl.querySelectorAll('.ac-i').forEach(el=>el.addEventListener('mousedown',e=>{
    e.preventDefault(); acIdx=+el.dataset.i; applyAC();
  }));
  const on = acEl.querySelector('.ac-i.on');
  if(on) on.scrollIntoView({ block:'nearest' });
}
function applyAC(){
  if(!acState) return;
  const it=acState.items[acIdx]; if(!it) return;
  if(acState.kind==='preset'){
    const back = 2 + acState.prefix.length;
    hideAC();
    for(let i=0;i<back;i++) document.execCommand('delete');
    if(typeof it.run==='function') it.run();
    return;
  }
  const rest=it.label.slice(acState.prefix.length);
  document.execCommand('insertText',false,rest+(acState.kind==='tag'?'>':''));
  hideAC();
}
function hideAC(){
  acState=null; acEl.classList.remove('show');
  clearTimeout(_acHideT);
  _acHideT = setTimeout(()=>{ if(!acState) acEl.hidden=true; }, 210);
}
bg.addEventListener('keydown', e=>{
  if(acState && !acEl.hidden){
    if(e.key==='ArrowDown'){ acIdx=Math.min(acState.items.length-1,acIdx+1); renderAC(); e.preventDefault(); return; }
    if(e.key==='ArrowUp'){   acIdx=Math.max(0,acIdx-1);                      renderAC(); e.preventDefault(); return; }
    if(e.key==='Tab'||e.key==='Enter'){ e.preventDefault(); applyAC(); return; }
    if(e.key==='Escape'){ hideAC(); e.preventDefault(); return; }
  }
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); exitEdit(); }
});

/* ─── hover link ─── */
function wireLinking(){
  page.addEventListener('mouseover', e=>{
    const el = e.target.closest('[data-ref]');
    if(!el || _editing) return;
    clearLit();
    bg.querySelectorAll(`.tk.live[data-ref="${el.dataset.ref}"]`).forEach(litOne);
  });
  page.addEventListener('mouseout', e=>{
    const el = e.target.closest('[data-ref]');
    if(!el) return;
    if(el.contains(e.relatedTarget)) return;
    if(!_editing) clearLit();
  });
}

/* ─── DOMContentLoaded init ─── */
window.addEventListener('DOMContentLoaded', ()=>{
  try{
    const l=localStorage.getItem('lang-d'); if(l==='en') setLang('en');
    const t=localStorage.getItem('theme-d'); if(t==='light') setTheme('light');
    const a=localStorage.getItem('accent-d'); if(a) setAccent(a);
  }catch(e){}
  gatherClasses();
  renderBg();
  wireLinking();
  stEl.addEventListener('dblclick', ()=>{ if(_hasDiff && !_editing){ clearDiff(true); renderBg(); } });

  // Debug helpers
  let _mutationCount = 0, _mutationSamples = [];
  const _pageMO = new MutationObserver(records => {
    _mutationCount += records.length;
    if(_mutationSamples.length < 50){
      records.slice(0, 5).forEach(r => {
        const tgt = r.target;
        let descr = '';
        if(r.type === 'characterData') descr = 'text in <' + (tgt.parentElement ? tgt.parentElement.tagName.toLowerCase() : '?') + '>';
        else if(r.type === 'attributes') descr = '@' + r.attributeName + ' on <' + tgt.tagName.toLowerCase() + '>';
        else if(r.type === 'childList') descr = 'children of <' + (tgt.tagName ? tgt.tagName.toLowerCase() : '?') + '> (+' + r.addedNodes.length + ', -' + r.removedNodes.length + ')';
        _mutationSamples.push(r.type + ': ' + descr);
      });
    }
  });
  _pageMO.observe(page, { childList: true, subtree: true, attributes: true, characterData: true });
  window._dbgMutations = function(reset){
    console.group('%c[MUTATIONS]', 'color:#ff90a8;font-weight:bold');
    console.log('total:', _mutationCount);
    _mutationSamples.forEach(s => console.log('  ' + s));
    if(reset){ _mutationCount = 0; _mutationSamples = []; }
    console.groupEnd();
  };
  window._debugState = function(){
    console.group('%c[DEBUG STATE]', 'color:#ffb547;font-weight:bold');
    console.log('_editing:', _editing, '_hasDiff:', _hasDiff);
    console.log('_diffOriginal:', _diffOriginal ? '(lines=' + _diffOriginal.length + ')' : null);
    console.log('bg .tk:', bg.querySelectorAll('.tk').length, '.x:', bg.querySelectorAll('.x').length);
    console.groupEnd();
  };

  setTimeout(()=>{ document.getElementById('hint')?.animate([{opacity:.3},{opacity:1},{opacity:.3}],{duration:2000,iterations:2}); }, 3000);

  /* ═══ BOOT SEQUENCE ═══ */
  (function runBoot(){
    const overlay = document.getElementById('boot-overlay');
    let heroKicked = false;
    function kickHero(){
      if(heroKicked) return; heroKicked = true;
      try{ tagPageForCompile(); }catch(e){ console.warn('[boot] tagPage failed', e); }
      try{ initHero(); }catch(e){ console.warn('[boot] initHero failed', e); }
    }
    let morphStarted = false;
    function startMorph(){
      if(morphStarted) return; morphStarted = true;
      try{ beginMorph(); }catch(e){ console.warn('[boot] morph failed', e); }
    }
    if(!overlay){ kickHero(); return; }
    try {
      if (sessionStorage.getItem('boot-done') === '1') {
        overlay.style.display = 'none'; kickHero(); return;
      }
      sessionStorage.setItem('boot-done', '1');
    } catch (e) { console.warn('[boot] sessionStorage check failed', e); }
    if(overlay.dataset.bootRan === '1') return;
    overlay.dataset.bootRan = '1';
    let finished = false;
    function done(){
      if(finished) return; finished = true;
      overlay.style.display = 'none'; kickHero();
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){
      kickHero();
      overlay.classList.add('fade-out');
      setTimeout(done, BOOT_TIMING.REDUCED_FADE);
      return;
    }
    const scene = buildBootScene(overlay);
    const abortActs = scheduleBootActs(scene, done);
    const disposeAbortListeners = attachAbortListeners(() => {
      kickHero(); startMorph(); abortActs();
    });
    const warmupAt = Math.max(0, BOOT_TIMING.FADE_START - BOOT_TIMING.HERO_WARMUP);
    setTimeout(kickHero, warmupAt);
    setTimeout(startMorph, warmupAt + 30);
    setTimeout(() => {
      try{ disposeAbortListeners(); }catch(_){}
      if(!finished) done();
    }, BOOT_TIMING.HARD_CAP + BOOT_TIMING.FADE_DUR + 100);
  })();
});
