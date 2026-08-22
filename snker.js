
(() => {
  'use strict';
  // v27: verified OG Chicago / 2025 / 2026 image matching and StockX 360-first card fallback
  const DATA_URL = 'sneakers.json?v=27';
  const FRAME_COUNT = 36;
  const FAST_360_CANDIDATES = 10;
  const FAST_PROBE_TIMEOUT = 1200;
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const state = { all: [], filtered: [], group: '2026', query: '' };
  const imageProbeCache = new Map();
  const marketCache = new Map();
  let currentItem = null;
  let viewer = null;
  let detailAbort = null;

  const els = {};
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    Object.assign(els, {
      yearNav: $('#yearNav'), grid: $('#sneakerGrid'), loading: $('#loadingState'), empty: $('#emptyState'),
      resultCount: $('#resultCount'), modeLabel: $('#modeLabel'), sectionTitle: $('#sectionTitle'), sectionCount: $('#sectionCount'),
      search: $('#searchInput'), clear: $('#clearBtn'), scrollTop: $('#scrollTopBtn'), dialog: $('#detailDialog'),
      detail: $('#detailContent'), closeDialog: $('#closeDialogBtn')
    });
    bindGlobalEvents();
    try {
      const res = await fetch(DATA_URL, { cache: 'default' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.all = await res.json();
      const urlGroup = new URL(location.href).searchParams.get('year');
      if (urlGroup && availableGroups().includes(urlGroup)) state.group = urlGroup;
      else if (!availableGroups().includes(state.group)) state.group = availableGroups().at(-1) || 'OG';
      buildYearNav();
      applyFilter(true);
      els.loading.hidden = true;
    } catch (err) {
      console.error(err);
      els.loading.textContent = 'sneakers.json を読み込めませんでした。GitHub Pages またはローカルサーバー上で開いてください。';
    }
  }

  function bindGlobalEvents() {
    els.search.addEventListener('input', () => { state.query = els.search.value.trim(); applyFilter(true); });
    els.clear.addEventListener('click', () => { els.search.value=''; state.query=''; applyFilter(true); els.search.focus(); });
    els.scrollTop.addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));
    window.addEventListener('scroll', () => els.scrollTop.classList.toggle('show', window.scrollY > 700), {passive:true});
    els.closeDialog.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', e => { if (e.target === els.dialog) closeDialog(); });
    els.dialog.addEventListener('close', cleanupViewer);
  }

  function normalize(v) { return String(v||'').toLowerCase().normalize('NFKC').replace(/\s+/g,' ').trim(); }
  function availableGroups() {
    const years = [...new Set(state.all.filter(x => x.group !== 'OG').map(x => x.group))].sort((a,b)=>Number(a)-Number(b));
    return state.all.some(x=>x.group==='OG') ? ['OG', ...years] : years;
  }

  function buildYearNav() {
    els.yearNav.innerHTML='';
    for (const group of availableGroups()) {
      const b=document.createElement('button');
      b.type='button'; b.className='year-btn'; b.dataset.group=group; b.textContent=group;
      b.classList.toggle('active', group===state.group);
      b.addEventListener('click', () => selectGroup(group));
      els.yearNav.appendChild(b);
    }
    centerActiveYear(false);
  }

  function selectGroup(group) {
    state.group=group; state.query=''; els.search.value='';
    $$('.year-btn',els.yearNav).forEach(b=>b.classList.toggle('active',b.dataset.group===group));
    const u=new URL(location.href); u.searchParams.set('year',group); history.replaceState(null,'',u);
    applyFilter(true); centerActiveYear(true); window.scrollTo({top:0,behavior:'smooth'});
  }

  function centerActiveYear(smooth=true) {
    const b=$('.year-btn.active',els.yearNav); if(!b)return;
    const left=b.offsetLeft-(els.yearNav.clientWidth-b.offsetWidth)/2;
    els.yearNav.scrollTo({left:Math.max(0,left),behavior:smooth?'smooth':'auto'});
  }

  function applyFilter(resetScroll=false) {
    const q=normalize(state.query);
    if (q) {
      state.filtered=state.all.filter(x=>normalize(`${x.title} ${x.sku} ${x.releaseDate} ${x.releasePrice} ${x.keywords} ${x.year}`).includes(q));
    } else {
      state.filtered=state.all.filter(x=>x.group===state.group);
    }
    renderGrid(true);
    updateHead(q);
  }

  function updateHead(q) {
    const total=state.filtered.length;
    els.resultCount.textContent=`全${state.all.length}モデル掲載`;
    if(q){
      els.modeLabel.textContent=`「${state.query}」を検索`;
      els.sectionTitle.textContent='検索結果';
      els.sectionCount.textContent=`${total}モデル`;
    } else {
      els.modeLabel.textContent=state.group==='OG'?'OGカラーを表示':`${state.group}年を表示`;
      els.sectionTitle.textContent=state.group==='OG'?'OGカラー（1985–1986）':`${state.group}年発売`;
      els.sectionCount.textContent=`${total}モデル`;
    }
  }

  function renderGrid() {
    els.grid.innerHTML='';
    state.filtered.forEach((item,i)=>els.grid.appendChild(makeCard(item,i)));
    els.empty.hidden=state.filtered.length!==0;
  }

  function makeCard(item,index) {
    const card=document.createElement('article'); card.className='sneaker-card'; card.tabIndex=0; card.dataset.id=item.id;
    card.innerHTML=`
      <div class="card-image-wrap">
        <img class="card-image" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <span class="card-year">${item.group==='OG'?item.year:item.year}</span>
        ${hasStockx(item)?'<span class="card-360">360°対応を確認</span>':''}
      </div>
      <div class="card-body">
        <h3 class="card-title"></h3>
        <div class="card-meta">
          <div class="card-meta-item"><span class="card-meta-label">発売日</span><span class="card-meta-value release"></span></div>
          <div class="card-meta-item"><span class="card-meta-label">発売価格</span><span class="card-meta-value price"></span></div>
          <div class="card-meta-item card-sku"><span class="card-meta-label">商品番号</span><span class="card-meta-value sku"></span></div>
        </div>
        <div class="card-open">詳細・360°・価格チャート</div>
      </div>`;
    $('.card-title',card).textContent=item.title;
    $('.release',card).textContent=item.releaseDate||'—'; $('.price',card).textContent=item.releasePrice||'—'; $('.sku',card).textContent=item.sku||'—';
    const img=$('.card-image',card); img.alt=item.title; setCardImage(img,item);
    card.addEventListener('click',()=>openDetail(item));
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(item);}});
    return card;
  }

  function hasStockx(item){return item.links?.some(x=>/stockx\.com/i.test(x.url));}
  function getLink(item,source){return item.links?.find(x=>source==='stockx'?/stockx\.com/i.test(x.url):/snkrdunk\.com/i.test(x.url))?.url||'';}
  function stockxSlug(item){
    const raw=getLink(item,'stockx'); if(!raw)return '';
    try{const parts=new URL(raw).pathname.split('/').filter(Boolean);const loc=new Set(['ja-jp','en-gb','ko-kr','fr-fr','es-mx','es-es','de-de','it-it','zh-cn','zh-tw']);return parts.find(p=>!loc.has(p.toLowerCase()))||'';}catch{return '';}
  }
  function folderFrom360(url){const m=String(url||'').match(/images\.stockx\.com\/360\/([^/]+)\/Images\//i);return m?decodeURIComponent(m[1]):'';}
  function folderFromStockxImage(url){const m=String(url||'').split('?')[0].match(/images\.stockx\.com\/images\/([^/]+?)\.(?:jpg|jpeg|png|webp)$/i);return m?decodeURIComponent(m[1]).replace(/-Product$/i,''):'';}
  function titleSeed(title){return String(title||'').replace(/[“”"'’]/g,'').replace(/[×]/g,' x ').replace(/\([^)]*\)/g,m=>m.replace(/[()]/g,'')).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/^Nike-/i,'');}
  function slugTitle(slug){const acr=new Set(['og','sp','unc','la','nyc','nrg','co','jp','psg','se','cmft','zoom']);return slug.split('-').map(p=>{const l=p.toLowerCase();if(acr.has(l))return l.toUpperCase();if(/^\d+$/.test(p))return p;return p? p[0].toUpperCase()+p.slice(1):p;}).join('-');}
  function addVariants(seed,out){
    if(!seed)return; const add=v=>{if(v&&!out.includes(v))out.push(v)}; add(seed); add(seed.replace(/^Nike-/i,''));
    if(/^Jordan-/i.test(seed))add('Air-'+seed); if(/^Air-Jordan-/i.test(seed))add(seed.replace(/^Air-/i,''));
    const swaps=[[/Jordan-1-Retro-High-OG-/i,'Jordan-1-Retro-High-'],[/Jordan-1-Retro-High-/i,'Jordan-1-Retro-High-OG-'],[/Air-Jordan-1-Retro-High-OG-/i,'Air-Jordan-1-Retro-High-'],[/Air-Jordan-1-Retro-High-/i,'Air-Jordan-1-Retro-High-OG-'],[/Air-Jordan-1-Retro-/i,'Air-Jordan-1-Retro-High-'],[/Jordan-1-Retro-/i,'Jordan-1-Retro-High-'],[/-Womens-/i,'-W-'],[/-Women-s-/i,'-W-'],[/-WMNS-/i,'-W-'],[/-W-/i,'-Womens-']];
    swaps.forEach(([re,rep])=>{if(re.test(seed))add(seed.replace(re,rep));}); [...out].forEach(v=>{if(/^Jordan-1-/i.test(v))add('Air-'+v);if(/^Air-Jordan-1-/i.test(v))add(v.replace(/^Air-/i,''));if(!/-Product$/i.test(v))add(v+'-Product');});
  }
  function folderCandidates(item){const out=[];addVariants(folderFrom360(item.image),out);addVariants(folderFromStockxImage(item.image),out);const slug=stockxSlug(item);if(slug){addVariants(slugTitle(slug),out);addVariants(slug.split('-').map(p=>p?p[0].toUpperCase()+p.slice(1):p).join('-'),out);}addVariants(titleSeed(item.title),out);return [...new Set(out)].slice(0,34);}
  function normalStockx(folder,ext='jpg'){return `https://images.stockx.com/images/${encodeURI(folder)}.${ext}?fit=fill&bg=FFFFFF&w=900&h=650&q=78&dpr=1&trim=color`;}
  function frameUrl(folder,frame,level='Lv2'){const n=String(frame).padStart(2,'0');return `https://images.stockx.com/360/${encodeURI(folder)}/Images/${encodeURI(folder)}/${level}/img${n}.jpg?w=1100&q=84&dpr=1`;}
  function proxyImage(url){
    if(!url || !/^https?:\/\//i.test(url)) return url || '';
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1000&h=760&fit=contain&output=webp`;
  }
  function staticCandidates(item){
    // v27: 一覧画像では推測したStockX画像を使わない。
    // 品番確認済みURLだけを使い、外部CDNの直リンク制限を避けるため画像キャッシュ経由を優先する。
    const verified=[];
    if(item.image) verified.push(item.image);
    if(Array.isArray(item.imageFallbacks)) verified.push(...item.imageFallbacks);
    if(item.sku) verified.push(`https://cdn.snkrdunk.com/uploads/sneaker-images/${encodeURIComponent(item.sku)}.jpg?size=l`);
    const direct=[...new Set(verified.filter(Boolean))];
    const arr=[];
    for(const url of direct){
      if(/^https?:\/\//i.test(url)) arr.push(proxyImage(url));
      arr.push(url);
    }
    return [...new Set(arr.filter(Boolean))];
  }
  function setCardImage(img,item){
    const list=staticCandidates(item); let i=0;
    const next=()=>{if(i>=list.length){const ph=document.createElement('div');ph.className='image-placeholder';ph.innerHTML='<div>AJ1<br><small>IMAGE NOT AVAILABLE</small></div>';img.replaceWith(ph);return;}img.src=list[i++];};
    img.addEventListener('error',next); next();
  }

  function openDetail(item){
    cleanupViewer(); currentItem=item;
    els.detail.innerHTML=detailMarkup(item);
    fillText(els.detail,item);
    bindDetail(item);
    if(typeof els.dialog.showModal==='function') els.dialog.showModal(); else els.dialog.setAttribute('open','');
    document.body.style.overflow='hidden';
    if(hasStockx(item)) load360(item);
    // 価格チャートは詳細を開いた時点で自動取得。ユーザーが展開操作をしなくても表示を開始する。
    requestAnimationFrame(() => {
      $$('.market-source', els.detail).forEach(panel => loadMarket(panel, false));
    });
  }
  function closeDialog(){if(els.dialog.open)els.dialog.close();else els.dialog.removeAttribute('open');document.body.style.overflow='';cleanupViewer();}
  function cleanupViewer(){viewer=null;currentItem=null;detailAbort?.abort();detailAbort=null;}
  function detailMarkup(item){return `
    <div class="detail-grid">
      <div class="detail-media">
        <div class="viewer-stage"><img class="viewer-image" alt="" draggable="false" referrerpolicy="no-referrer"><span class="viewer-badge" hidden>360° VIEW</span><button class="viewer-arrow viewer-prev" type="button" hidden>‹</button><button class="viewer-arrow viewer-next" type="button" hidden>›</button><span class="viewer-help" hidden>ドラッグ / スワイプで回転</span><span class="viewer-count" hidden>1 / 36</span></div>
        <div class="viewer-actions"><span class="viewer-status">${hasStockx(item)?'360°素材を確認しています…':'StockX 360°素材なし'}</span></div>
      </div>
      <div class="detail-info">
        <p class="detail-eyebrow">AIR JORDAN 1 · <span class="detail-year"></span></p>
        <h2 class="detail-title"></h2>
        <div class="detail-meta"><div class="detail-meta-item"><span>発売日</span><strong class="d-release"></strong></div><div class="detail-meta-item"><span>発売価格</span><strong class="d-price"></strong></div><div class="detail-meta-item"><span>商品番号</span><strong class="d-sku"></strong></div></div>
        ${marketMarkup(item)}
        <div class="detail-links"></div>
      </div>
    </div>`;}
  function fillText(root,item){$('.detail-title',root).textContent=item.title;$('.detail-year',root).textContent=item.year;$('.d-release',root).textContent=item.releaseDate||'—';$('.d-price',root).textContent=item.releasePrice||'—';$('.d-sku',root).textContent=item.sku||'—';const vi=$('.viewer-image',root);vi.alt=item.title;setDetailStatic(vi,item);const links=$('.detail-links',root);(item.links||[]).forEach(l=>{const a=document.createElement('a');a.href=l.url;a.target='_blank';a.rel='noopener';a.className='product-link '+(/stockx/i.test(l.label)?'stockx':/snkr/i.test(l.label)?'snkrdunk':'');a.textContent=l.label;links.appendChild(a);});}
  function setDetailStatic(img,item){const list=staticCandidates(item);let i=0;const next=()=>{if(i>=list.length){img.style.display='none';return;}img.src=list[i++];};img.addEventListener('error',next,{passive:true});next();}
  function bindDetail(item){detailAbort?.abort();detailAbort=new AbortController();const signal=detailAbort.signal,root=els.detail;$('.viewer-prev',root)?.addEventListener('click',()=>viewer&&showFrame(viewer.frame-1),{signal});$('.viewer-next',root)?.addEventListener('click',()=>viewer&&showFrame(viewer.frame+1),{signal});const stage=$('.viewer-stage',root);let dragging=false,lastX=0,rem=0;stage.addEventListener('pointerdown',e=>{if(!viewer||e.target.closest('button'))return;dragging=true;lastX=e.clientX;rem=0;stage.setPointerCapture?.(e.pointerId)},{signal});stage.addEventListener('pointermove',e=>{if(!dragging||!viewer)return;rem+=e.clientX-lastX;lastX=e.clientX;const steps=Math.trunc(rem/11);if(steps){rem-=steps*11;showFrame(viewer.frame-steps);}},{signal});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>stage.addEventListener(ev,()=>dragging=false,{signal}));root.addEventListener('toggle',e=>{const d=e.target;if(d.matches?.('.market-section')&&d.open)d.querySelectorAll('.market-source').forEach(p=>loadMarket(p));}, {capture:true,signal});root.addEventListener('click',marketClickHandler,{signal});root.addEventListener('change',marketChangeHandler,{signal});bindMarketChartGestures(root);}

  async function probeImage(url,timeout=3500){if(!url)return false;if(imageProbeCache.has(url))return imageProbeCache.get(url);const p=new Promise(resolve=>{const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(t);img.onload=img.onerror=null;resolve(ok)};const t=setTimeout(()=>finish(false),timeout);img.onload=()=>finish(img.naturalWidth>40&&img.naturalHeight>40);img.onerror=()=>finish(false);img.src=url});imageProbeCache.set(url,p);return p;}
  async function load360(item){
    const status=$('.viewer-status',els.detail);
    if(!status)return;
    const openedItemId=item.id;
    status.textContent='360°素材を高速確認しています…';

    // 以前は最大34候補×2階層を順番に確認していたため、見つからない商品で非常に遅くなっていた。
    // 有力候補だけを並列確認し、短時間で静止画へフォールバックする。
    const folders=folderCandidates(item).slice(0,FAST_360_CANDIDATES);
    const candidates=[];
    for(const folder of folders){
      candidates.push({folder,level:'Lv2'});
      candidates.push({folder,level:'Lv1'});
    }

    const firstChecks=await Promise.all(candidates.map(async c=>({
      ...c,
      ok: await probeImage(frameUrl(c.folder,1,c.level),FAST_PROBE_TIMEOUT)
    })));
    if(currentItem?.id!==openedItemId)return;

    const possible=firstChecks.filter(x=>x.ok);
    if(possible.length){
      const validation=await Promise.all(possible.slice(0,6).map(async c=>({
        ...c,
        ok18: await probeImage(frameUrl(c.folder,18,c.level),FAST_PROBE_TIMEOUT)
      })));
      if(currentItem?.id!==openedItemId)return;
      const found=validation.find(x=>x.ok18);
      if(found){
        viewer={folder:found.folder,level:found.level,frame:1};
        enableViewer();
        status.textContent='左右ドラッグ / スワイプ / 矢印で回転';
        return;
      }
    }

    status.textContent='静止画で表示しています';
  }
  function enableViewer(){const stage=$('.viewer-stage',els.detail),img=$('.viewer-image',els.detail);stage.classList.add('has-360');['.viewer-badge','.viewer-prev','.viewer-next','.viewer-help','.viewer-count'].forEach(s=>$(s,els.detail).hidden=false);showFrame(1);preloadFrames(1);}
  function showFrame(frame){if(!viewer)return;viewer.frame=((frame-1+FRAME_COUNT)%FRAME_COUNT)+1;const img=$('.viewer-image',els.detail);img.style.display='block';img.src=frameUrl(viewer.folder,viewer.frame,viewer.level);$('.viewer-count',els.detail).textContent=`${viewer.frame} / ${FRAME_COUNT}`;preloadFrames(viewer.frame);}
  function preloadFrames(frame){if(!viewer)return;[-2,-1,1,2].forEach(o=>{const f=((frame-1+o+FRAME_COUNT)%FRAME_COUNT)+1;const im=new Image();im.src=frameUrl(viewer.folder,f,viewer.level)});}

  function marketMarkup(item){
    const sn=getLink(item,'snkrdunk');
    if(!sn && !item.sku){
      return `<details class="market-section" open><summary>SNKRDUNK 価格チャート</summary><div class="market-inner"><div class="market-empty-standalone">SNKRDUNKの商品ページを特定できないため、価格チャートは表示できません。</div></div></details>`;
    }
    return `<details class="market-section" open><summary>SNKRDUNK 価格チャート － サイズ・新品 / 中古</summary><div class="market-inner"><p class="market-note">SNKRDUNKの公開価格情報だけを表示します。チャート上をクリック／タップすると、その位置に最も近い価格へ黒い玉が移動します。黒い玉を左右にドラッグすることもできます。</p><div class="market-grid">${marketPanel(sn,item.sku)}</div></div></details>`;
  }

  function canonicalSnkrHistoryUrl(raw,sku){
    if(sku) return `https://snkrdunk.com/products/${encodeURIComponent(sku)}/sales-histories?slide=right`;
    if(!raw)return '';
    try{
      const u=new URL(raw),parts=u.pathname.split('/').filter(Boolean),pi=parts.indexOf('products'),slug=pi>=0?parts[pi+1]:parts.at(-1);
      return slug?`https://snkrdunk.com/products/${encodeURIComponent(slug)}/sales-histories?slide=right`:raw;
    }catch{return raw;}
  }

  function marketPanel(url,sku){
    const sizes=['All','22.5','23','23.5','24','24.5','25','25.5','26','26.5','27','27.5','28','28.5','29','29.5','30','30.5','31','31.5','32'];
    const opts=sizes.map(x=>`<option ${x==='All'?'selected':''} value="${x}">${x==='All'?'全サイズ':x}</option>`).join('');
    const dataUrl=canonicalSnkrHistoryUrl(url,sku);
    return `<section class="market-source market-snkr" data-source="snkrdunk" data-url="${escapeAttr(dataUrl)}" data-sku="${escapeAttr(sku)}">
      <div class="market-source-head"><strong>SNKRDUNK</strong><span class="market-status">準備中</span></div>
      <div class="market-controls"><label>サイズ (CM) <select class="market-size">${opts}</select></label><div class="market-condition"><button type="button" class="active" data-condition="new">新品</button><button type="button" data-condition="used">中古</button></div></div>
      <div class="market-current" aria-live="polite"><span>現在の価格</span><strong>—</strong><small>全サイズ · 新品</small></div>
      <div class="market-chart-shell">
        <div class="market-chart-head"><span class="market-chart-title">売買価格の推移（1か月足）</span><span class="market-selection">全サイズ · 新品</span></div>
        <div class="market-interval-row"><span class="market-interval-label">表示間隔</span><div class="market-interval" role="group" aria-label="チャート表示間隔"><button type="button" class="active" aria-pressed="true" data-chart-interval="month">1か月足</button><button type="button" aria-pressed="false" data-chart-interval="year">1年足</button></div></div>
        <div class="market-scope" hidden></div>
        <div class="market-chart-guide" hidden>
          <span>チャートをクリック／タップするとその位置へ価格の玉が移動</span>
          <button type="button" data-chart-reset>最新に戻す</button>
        </div>
        <div class="market-chart-box">
          <div class="market-loading" hidden><span class="market-spinner"></span><span>価格情報を取得しています…</span></div>
          <div class="market-empty">価格情報を準備しています…</div>
          <svg class="market-chart" hidden viewBox="0 0 760 270" preserveAspectRatio="xMidYMid meet" role="img" aria-label="SNKRDUNK価格チャート" tabindex="0"></svg>
        </div>
      </div>
      <div class="market-metrics"></div>
      <p class="market-footnote" hidden></p>
      <div class="market-actions">${dataUrl?`<a class="market-open" href="${escapeAttr(dataUrl)}" target="_blank" rel="noopener">SNKRDUNKで相場を見る</a>`:''}</div>
    </section>`;
  }
  function escapeAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function clearMarketVisual(panel,message='新しい条件の価格を取得しています…'){
    const empty=$('.market-empty',panel),svg=$('.market-chart',panel),metrics=$('.market-metrics',panel),foot=$('.market-footnote',panel),scope=$('.market-scope',panel),current=$('.market-current',panel),guide=$('.market-chart-guide',panel);
    if(svg){svg.setAttribute('hidden','');svg.innerHTML='';svg.style.width='';svg._chartMeta=null;svg.dataset.selectedIndex='';}
    delete panel.dataset.selectedTime;
    if(empty){empty.hidden=false;empty.textContent=message;}
    if(metrics)metrics.innerHTML='';
    if(foot){foot.hidden=true;foot.textContent='';}
    if(scope){scope.hidden=true;scope.textContent='';scope.className='market-scope';}
    if(guide)guide.hidden=true;
    if(current){$('span',current).textContent='現在の価格';$('strong',current).textContent='—';$('small',current).textContent='取得中…';current.classList.remove('is-reference','is-history');}
  }

  function marketClickHandler(e){
    const cond=e.target.closest('.market-condition button');
    if(cond){
      const panel=cond.closest('.market-source');
      if(cond.classList.contains('active'))return;
      $$('.market-condition button',panel).forEach(b=>b.classList.toggle('active',b===cond));
      panel.dataset.loadedKey='';
      clearMarketVisual(panel);
      loadMarket(panel,true);
      return;
    }
    const interval=e.target.closest('[data-chart-interval]');
    if(interval){
      e.preventDefault();
      const panel=interval.closest('.market-source');
      switchChartInterval(panel,interval.dataset.chartInterval||'month');
      return;
    }
    const reset=e.target.closest('[data-chart-reset]');
    if(reset){
      const panel=reset.closest('.market-source'),svg=$('.market-chart',panel);
      const pts=svg?._chartMeta?.points;
      if(pts?.length){ selectChartPoint(panel,pts.length-1,true); scrollChartToLatest(panel,true); }
    }
  }

  function marketChangeHandler(e){
    if(!e.target.matches('.market-size'))return;
    const panel=e.target.closest('.market-source');
    panel.dataset.loadedKey='';
    clearMarketVisual(panel);
    loadMarket(panel,true);
  }

  function switchChartInterval(panel,nextInterval){
    if(!panel)return;
    const svg=$('.market-chart',panel);
    const meta=svg?._chartMeta;
    const currentIndex=meta?.points?.length?Math.max(0,Math.min(meta.points.length-1,Number(svg.dataset.selectedIndex||meta.latestIndex))):-1;
    const selectedTime=currentIndex>=0?meta.points[currentIndex]?.time:Number(panel.dataset.selectedTime);
    $$('.market-interval button',panel).forEach(b=>{
      const active=(b.dataset.chartInterval||'month')===nextInterval;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',active?'true':'false');
    });
    panel.dataset.chartInterval=nextInterval;
    if(Number.isFinite(Number(selectedTime)))panel.dataset.selectedTime=String(Number(selectedTime));
    if(panel._marketData)drawChart(panel,panel._marketData,{preferredTime:Number(selectedTime)});
  }

  function readerUrl(url,bust=false){
    if(!url)return'';
    let target=url;
    if(bust){try{const u=new URL(url);u.searchParams.set('_archive_refresh',String(Date.now()));target=u.toString();}catch{}}
    return `https://r.jina.ai/${target}`;
  }

  function withSnkrParams(raw,size,condition){
    if(!raw)return'';
    try{
      const u=new URL(raw),skuMatch=(u.pathname.match(/\/products\/([^/]+)/)||[])[1];
      if(skuMatch)u.pathname=`/products/${skuMatch}/sales-histories`;
      u.search='';
      if(size&&size!=='All')u.searchParams.set('size',size);
      u.searchParams.set('condition',condition==='used'?'used':'new');
      u.searchParams.set('slide','right');
      return u.toString();
    }catch{return raw;}
  }

  async function fetchText(target,force=false,signal){
    const key='reader:'+target;
    if(!force&&marketCache.has(key))return marketCache.get(key);
    const local=new AbortController(),abort=()=>local.abort();signal?.addEventListener('abort',abort,{once:true});
    const t=setTimeout(()=>local.abort(),12000);
    try{
      const r=await fetch(readerUrl(target,force),{signal:local.signal,cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const text=await r.text();
      if(text.length<120)throw new Error('empty response');
      marketCache.set(key,text);return text;
    }finally{clearTimeout(t);signal?.removeEventListener?.('abort',abort);}
  }

  async function fetchTextSafe(target,force=false,signal){
    if(!target)return '';
    try{
      return await fetchText(target,force,signal);
    }catch(err){
      if(signal?.aborted)throw err;
      console.warn('[market] fetch fallback:', target, err?.message||err);
      return '';
    }
  }

  function explicitNoTrades(text){
    const s=String(text||'').replace(/\s+/g,' ');
    return /(取引(?:履歴)?(?:が)?ありません|売買(?:履歴|実績)?(?:が)?ありません|販売(?:履歴|実績)?(?:が)?ありません|該当する(?:取引|売買|販売)(?:履歴|実績)?(?:が)?ありません|まだ取引がありません|取引データがありません|no sales|no transactions)/i.test(s);
  }

  function hasTrend(data){
    return !!(data&&data.kind==='trend'&&data.rawPoints?.length>=2);
  }
  function priceFromData(data){
    return primaryPrice(data)||0;
  }
  function combineMarketData(chartData,currentPrice,referenceLabel=''){
    if(!chartData)return null;
    if(chartData.kind!=='trend'){
      if(currentPrice>0)return {...chartData,selectedPrice:currentPrice};
      return chartData;
    }
    const next={...chartData,selectedPrice:currentPrice>0?currentPrice:(chartData.selectedPrice||0)};
    if(referenceLabel){
      next.isReferenceChart=true;
      next.chartScope=referenceLabel;
      const extra=` 選択条件専用の履歴を取得できなかったため、「${referenceLabel}」を参考チャートとして表示しています。`;
      next.note=(next.note||'SNKRDUNK公開ページから取得できた価格情報です。')+extra;
    }
    return next;
  }

  const moneyRE=/(?:￥|¥)\s*[\d,]+/g;
  const toNum=v=>Number(String(v||'').replace(/[^0-9.]/g,''))||0;
  const fmt=n=>n?`¥${Math.round(n).toLocaleString()}`:'—';

  function normalizeDateLabel(s){
    const t=String(s||'').trim().replace(/年|月/g,'/').replace(/日/g,'').replace(/[.-]/g,'/').replace(/\/$/,'');
    let m=t.match(/^(20\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    if(m)return `${m[1].slice(2)}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}`;
    m=t.match(/^(\d{1,2})\/(\d{1,2})$/);if(m)return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}`;
    return t;
  }
  function dateValue(label){
    const s=String(label).replace(/年|月/g,'/').replace(/日/g,'').replace(/[.-]/g,'/');
    let m=s.match(/^(20\d{2})\/(\d{1,2})\/(\d{1,2})$/);if(m)return new Date(+m[1],+m[2]-1,+m[3]).getTime();
    m=s.match(/^(\d{1,2})\/(\d{1,2})$/);if(m){const now=new Date();let y=now.getFullYear(),ts=new Date(y,+m[1]-1,+m[2]).getTime();if(ts>now.getTime()+7*86400000)ts=new Date(y-1,+m[1]-1,+m[2]).getTime();return ts;}
    return NaN;
  }

  function conditionHeading(line,condition){
    const s=String(line||'').replace(/[#*_`>|\-]/g,' ').replace(/\s+/g,' ').trim();
    const word=condition==='used'?'中古':'新品',other=condition==='used'?'新品':'中古';
    if(!s.includes(word)||s.includes(other))return false;
    if(s.length<=18)return true;
    return /(売買|取引|販売|相場|履歴|価格|実績|history|sales)/i.test(s);
  }

  function extractConditionSection(text,condition){
    const lines=String(text||'').split(/\r?\n/),wanted=[],other=[];
    lines.forEach((line,i)=>{if(conditionHeading(line,condition))wanted.push(i);if(conditionHeading(line,condition==='used'?'new':'used'))other.push(i);});
    if(wanted.length){
      const start=wanted[0],nextOther=other.find(i=>i>start),nextWanted=wanted.find(i=>i>start+1);
      const end=Math.min(nextOther??lines.length,nextWanted??lines.length,start+900);
      return lines.slice(Math.max(0,start-3),end).join('\n');
    }
    // condition=used を指定したページで中古セクションを識別できない場合、本文全体を中古履歴として扱わない。
    if(condition==='used')return '';
    // 新品側は中古見出しより前だけを優先。見出しが無ければ取得本文全体を使う。
    if(other.length)return lines.slice(0,other[0]).join('\n');
    return String(text||'');
  }

  function sizeContexts(text,size){
    if(!text||size==='All')return [text];
    const esc=String(size).replace('.','\\.'),res=[],patterns=[new RegExp(`${esc}\\s*cm`,'ig'),new RegExp(`(?:サイズ|SIZE)\\s*[:：]?\\s*${esc}(?:\\b|\\s|$)`,'ig')];
    for(const re of patterns){let m,g=0;while((m=re.exec(text))&&g++<120){res.push(text.slice(Math.max(0,m.index-520),Math.min(text.length,m.index+720)));}}
    return [...new Set(res)];
  }

  function extractTransactions(text,size='All'){
    const hits=[],add=(date,price,context='')=>{
      const value=toNum(price);if(value<1000||value>2000000)return;
      if(size!=='All'&&!new RegExp(`${String(size).replace('.','\\.')}\\s*cm`,'i').test(context))return;
      const label=normalizeDateLabel(date),time=dateValue(date),key=`${label}|${value}`;
      if(!hits.some(x=>x.key===key))hits.push({key,label,value,time});
    };
    const src=String(text||'');
    const patterns=[
      /(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})[\s\S]{0,220}?(?:￥|¥)\s*([\d,]+)/g,
      /(?:￥|¥)\s*([\d,]+)[\s\S]{0,220}?(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})/g,
      /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日[\s\S]{0,220}?(?:￥|¥)\s*([\d,]+)/g,
      /(?:^|[^0-9])(\d{1,2}\/\d{1,2})(?![0-9])[\s\S]{0,180}?(?:￥|¥)\s*([\d,]+)/gm,
      /(?:￥|¥)\s*([\d,]+)[\s\S]{0,180}?(?:^|[^0-9])(\d{1,2}\/\d{1,2})(?![0-9])/gm,
      /(?:^|[^0-9])(\d{1,2})月\s*(\d{1,2})日[\s\S]{0,180}?(?:￥|¥)\s*([\d,]+)/gm
    ];
    let m,g=0;
    while((m=patterns[0].exec(src))&&g++<300)add(m[1],m[2],m[0]);
    g=0;while((m=patterns[1].exec(src))&&g++<300)add(m[2],m[1],m[0]);
    g=0;while((m=patterns[2].exec(src))&&g++<300)add(`${m[1]}/${m[2]}/${m[3]}`,m[4],m[0]);
    g=0;while((m=patterns[3].exec(src))&&g++<300)add(m[1],m[2],m[0]);
    g=0;while((m=patterns[4].exec(src))&&g++<300)add(m[2],m[1],m[0]);
    g=0;while((m=patterns[5].exec(src))&&g++<300)add(`${m[1]}/${m[2]}`,m[3],m[0]);
    hits.sort((a,b)=>(Number.isFinite(a.time)?a.time:0)-(Number.isFinite(b.time)?b.time:0));
    return hits.slice(-120);
  }


  function aggregateMonthly(points){
    const valid=(points||[]).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.value>0).sort((a,b)=>a.time-b.time);
    if(valid.length<2)return valid;
    const groups=new Map();
    for(const p of valid){
      const d=new Date(p.time);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const row=groups.get(key)||{key,year:d.getFullYear(),month:d.getMonth()+1,items:[]};
      row.items.push(p);groups.set(key,row);
    }
    const monthly=[...groups.values()].map(g=>{
      const items=g.items.sort((a,b)=>a.time-b.time);
      const last=items.at(-1);
      const vals=items.map(x=>x.value);
      return {
        key:g.key,
        label:`${String(g.year).slice(2)}/${String(g.month).padStart(2,'0')}`,
        fullLabel:`${g.year}年${g.month}月`,
        value:last.value,
        time:last.time,
        open:items[0].value,
        high:Math.max(...vals),
        low:Math.min(...vals),
        close:last.value,
        count:items.length,
        rawLabel:last.label
      };
    });
    return monthly.length>=2?monthly:valid;
  }
  function aggregateYearly(points){
    const valid=(points||[]).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.value>0).sort((a,b)=>a.time-b.time);
    if(!valid.length)return [];
    const groups=new Map();
    for(const p of valid){
      const d=new Date(p.time),year=d.getFullYear();
      const row=groups.get(year)||{year,items:[]};
      row.items.push(p);groups.set(year,row);
    }
    return [...groups.values()].map(g=>{
      const items=g.items.sort((a,b)=>a.time-b.time),last=items.at(-1),vals=items.map(x=>x.value);
      return {
        key:String(g.year),label:String(g.year),fullLabel:`${g.year}年`,value:last.value,time:last.time,
        open:items[0].value,high:Math.max(...vals),low:Math.min(...vals),close:last.value,count:items.length,rawLabel:last.label
      };
    });
  }

  function chartPointsFor(data,interval){
    const raw=data?.rawPoints||[];
    return interval==='year'?aggregateYearly(raw):aggregateMonthly(raw);
  }

  function extractCurrentPrices(text,size='All'){
    const contexts=sizeContexts(text,size),prices=[];
    for(const chunk of contexts){
      const ms=chunk.match(moneyRE)||[];
      for(const v of ms){const n=toNum(v);if(n>=1000&&n<=2000000)prices.push(n);}
    }
    return [...new Set(prices)].sort((a,b)=>a-b);
  }

  function parseSnkrData(text,condition,size){
    const whole=String(text||'');
    const section=extractConditionSection(whole,condition);
    const conditionLabel=condition==='used'?'中古':'新品';
    const sizeLabel=size==='All'?'全サイズ':`${size}cm`;

    // 現在価格はユーザーが選んだ「サイズ × 新品/中古」を最優先する。
    // 条件見出しを分離できない中古ページでも、condition=used で取得したページ本文から
    // サイズ周辺の価格を拾えるようにする。
    const priceSources=[];
    if(section) priceSources.push(section);
    if(!section || condition==='used') priceSources.push(whole);
    let selectedPrices=[];
    for(const src of priceSources){
      selectedPrices=extractCurrentPrices(src,size);
      if(selectedPrices.length)break;
    }
    const selectedPrice=selectedPrices[0]||0;

    // チャートは「条件・サイズ完全一致」を最優先し、履歴が足りない場合だけ段階的にフォールバック。
    // これにより個別サイズや中古を選んでもチャート枠自体が消えにくくなる。
    const candidates=[];
    const pushCandidate=(label,src,sz,reference=false)=>{
      if(!src)return;
      let pts=extractTransactions(src,sz);
      if(sz!=='All'&&pts.length<2){
        const joined=sizeContexts(src,sz).join('\n');
        if(joined)pts=extractTransactions(joined,'All');
      }
      if(pts.length>=2)candidates.push({label,points:pts,reference});
    };

    pushCandidate(`${sizeLabel}・${conditionLabel}`,section,size,false);
    if(size!=='All')pushCandidate(`全サイズ・${conditionLabel}`,section,'All',true);

    // condition=used/new を付けて取得したページ本文を条件ページとして使う。
    // 見出し抽出に失敗しても、ページ自体に履歴があれば参考チャートとして残す。
    if(section!==whole){
      pushCandidate(`${sizeLabel}・${conditionLabel}（条件ページ）`,whole,size,true);
      if(size!=='All')pushCandidate(`全サイズ・${conditionLabel}（条件ページ）`,whole,'All',true);
    }

    const chosen=candidates[0];
    if(chosen){
      const rawPoints=chosen.points;
      const monthlyPoints=aggregateMonthly(rawPoints);
      const vals=rawPoints.map(x=>x.value),latest=rawPoints.at(-1).value;
      const current=selectedPrice||latest;
      const referenceNote=chosen.reference?` 選択条件だけの履歴が十分でないため、チャートは「${chosen.label}」を参考表示しています。`:` チャートは「${chosen.label}」の履歴です。`;
      return {
        kind:'trend',points:monthlyPoints,rawPoints,currency:'¥',selectedPrice:current,
        chartScope:chosen.label,isReferenceChart:chosen.reference,
        metrics:[['現在',fmt(current)],['最安',fmt(Math.min(...vals))],['最高',fmt(Math.max(...vals))],['取引',rawPoints.length+'件']],
        note:`SNKRDUNK公開ページから取得できた価格情報です。${referenceNote} 1か月足 / 1年足で切り替えられます。`
      };
    }

    if(selectedPrices.length){
      const point=selectedPrices[0];
      return {kind:'point',point,selectedPrice:point,currency:'¥',metrics:[['現在の最安',fmt(point)],['確認価格数',selectedPrices.length+'件'],['価格帯',selectedPrices.length>1?`${fmt(selectedPrices[0])}〜${fmt(selectedPrices.at(-1))}`:fmt(point)]],note:`${sizeLabel}・${conditionLabel}の現在価格は取得できましたが、チャート用の過去履歴は取得できませんでした。`};
    }

    // 最後の保険：選択条件の価格も履歴も無い場合でも、商品全体の履歴があれば参考チャートを表示する。
    const fallback=extractTransactions(whole,'All');
    if(fallback.length>=2){
      const vals=fallback.map(x=>x.value),latest=fallback.at(-1).value;
      return {
        kind:'trend',points:aggregateMonthly(fallback),rawPoints:fallback,currency:'¥',selectedPrice:0,
        chartScope:'商品全体（参考）',isReferenceChart:true,
        metrics:[['参考最新',fmt(latest)],['最安',fmt(Math.min(...vals))],['最高',fmt(Math.max(...vals))],['取引',fallback.length+'件']],
        note:`${sizeLabel}・${conditionLabel}の現在価格は取得できませんでしたが、商品全体の売買履歴を参考チャートとして表示しています。`
      };
    }

    return {kind:'no-trades',metrics:[['取引','0件']],noTrades:true,unsupported:`${sizeLabel}・${conditionLabel}の取引はありません。`};
  }

  function setMarketLoading(panel,on){
    const loading=$('.market-loading',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel);
    if(loading)loading.hidden=!on;panel.classList.toggle('is-loading',!!on);
    if(on){if(empty)empty.hidden=true;if(svg)svg.hidden=true;}
  }
  function setSelectionLabel(panel,size,condition){
    const s=size==='All'?'全サイズ':`${size}cm`;$('.market-selection',panel).textContent=`${s} · ${condition==='used'?'中古':'新品'}`;
  }
  function showScope(panel,text,type='ok'){const el=$('.market-scope',panel);if(!el)return;el.textContent=text;el.className=`market-scope ${type}`;el.hidden=false;}
  function primaryPrice(data){if(!data)return 0;if(data.selectedPrice>0)return data.selectedPrice;if(data.kind==='trend')return data.points?.at(-1)?.value||0;if(data.kind==='point')return data.point||0;return 0;}
  function renderCurrentPrice(panel,data,label=''){
    const box=$('.market-current',panel);if(!box)return;const price=primaryPrice(data);$('strong',box).textContent=price?fmt(price):'—';$('small',box).textContent=label||($('.market-selection',panel)?.textContent||'');
  }

  async function loadMarket(panel,force=false){
    const raw=panel.dataset.url,status=$('.market-status',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel),metrics=$('.market-metrics',panel),foot=$('.market-footnote',panel);
    if(!raw){status.textContent='リンクなし';status.className='market-status error';setMarketLoading(panel,false);empty.hidden=false;empty.textContent='SNKRDUNKの商品リンクがありません。';return;}

    const size=$('.market-size',panel).value;
    const condition=$('.market-condition button.active',panel)?.dataset.condition||'new';
    const selectionLabel=`${size==='All'?'全サイズ':size+'cm'} · ${condition==='used'?'中古':'新品'}`;
    setSelectionLabel(panel,size,condition);

    const selectedTarget=withSnkrParams(raw,size,condition);
    const conditionAllTarget=withSnkrParams(raw,'All',condition);
    const baseTarget=raw;
    $('.market-open',panel)?.setAttribute('href',selectedTarget||baseTarget);

    const key=`${selectedTarget}|${condition}|${size}`;
    if(!force&&panel.dataset.loadedKey===key)return;

    panel._marketAbort?.abort();
    const ctrl=new AbortController();panel._marketAbort=ctrl;
    const requestId=String((Number(panel.dataset.requestId)||0)+1);panel.dataset.requestId=requestId;
    status.textContent='取得中';status.className='market-status';
    clearMarketVisual(panel,'選択条件の価格を取得しています…');setMarketLoading(panel,true);

    try{
      // 1) まずユーザーが選んだ「サイズ × 新品/中古」を取得。
      // ここが失敗しても処理を終了せず、同条件の全サイズページへ必ずフォールバックする。
      const selectedText=await fetchTextSafe(selectedTarget,force,ctrl.signal);
      if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      let anyFetched=!!selectedText;
      let sawExplicitNoTrades=explicitNoTrades(selectedText);
      let selectedData=selectedText?parseSnkrData(selectedText,condition,size):null;
      let currentPrice=priceFromData(selectedData);
      let finalData=hasTrend(selectedData)?selectedData:null;
      let referenceLabel='';

      // 2) 同じ新品/中古の「全サイズ」ページ。
      // 個別サイズURLが取得不可でも、この本文からサイズ周辺の現在価格を拾える場合がある。
      let conditionAllText='';
      if(!finalData || !currentPrice){
        if(conditionAllTarget===selectedTarget) conditionAllText=selectedText;
        else conditionAllText=await fetchTextSafe(conditionAllTarget,force,ctrl.signal);
        if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
        anyFetched=anyFetched||!!conditionAllText;
        sawExplicitNoTrades=sawExplicitNoTrades||explicitNoTrades(conditionAllText);

        if(conditionAllText){
          const sizedFromAll=parseSnkrData(conditionAllText,condition,size);
          if(!currentPrice)currentPrice=priceFromData(sizedFromAll);
          if(!finalData&&hasTrend(sizedFromAll))finalData=sizedFromAll;

          if(!finalData&&size!=='All'){
            const allConditionData=parseSnkrData(conditionAllText,condition,'All');
            if(hasTrend(allConditionData)){
              finalData=allConditionData;
              referenceLabel=`全サイズ・${condition==='used'?'中古':'新品'}`;
            }
          }
        }
      }

      // 3) 最後にパラメータ無しの商品履歴ページも確認。
      // SNKRDUNK/Jina側が size や condition のクエリを拒否するケースでもチャートを残すため。
      if(!finalData || !currentPrice){
        let baseText='';
        if(baseTarget===selectedTarget)baseText=selectedText;
        else if(baseTarget===conditionAllTarget)baseText=conditionAllText;
        else baseText=await fetchTextSafe(baseTarget,false,ctrl.signal);
        if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
        anyFetched=anyFetched||!!baseText;
        sawExplicitNoTrades=sawExplicitNoTrades||explicitNoTrades(baseText);

        if(baseText){
          const sizedBase=parseSnkrData(baseText,condition,size);
          if(!currentPrice)currentPrice=priceFromData(sizedBase);
          if(!finalData&&hasTrend(sizedBase))finalData=sizedBase;

          if(!finalData){
            const allBase=parseSnkrData(baseText,condition,'All');
            if(hasTrend(allBase)){
              finalData=allBase;
              referenceLabel=`全サイズ・${condition==='used'?'中古':'新品'}（参考）`;
            }
          }
        }
      }

      // チャートが無くても選択条件の現在価格だけ取れていれば価格は表示する。
      // 逆に現在価格が取れなくても、履歴が取れていれば参考チャートを表示する。
      let data;
      if(finalData){
        data=combineMarketData(finalData,currentPrice,referenceLabel);
      }else if(selectedData&&priceFromData(selectedData)>0){
        data={...selectedData,selectedPrice:currentPrice||priceFromData(selectedData)};
      }else if(currentPrice>0){
        data={kind:'point',point:currentPrice,selectedPrice:currentPrice,currency:'¥',metrics:[['現在',fmt(currentPrice)]],note:`${selectionLabel}の現在価格のみ取得できました。`};
      }else if(anyFetched){
        data={kind:'no-trades',noTrades:true,metrics:[['取引','0件']],selectedPrice:0,unsupported:`${selectionLabel}の取引はありません。`,note:'SNKRDUNKのページは取得できましたが、選択条件に該当する売買履歴は確認できませんでした。'};
      }else{
        data={kind:'fetch-error',metrics:[],unsupported:'SNKRDUNKから価格データを取得できませんでした。'};
      }

      panel._marketData=data;
      drawChart(panel,data);
      renderCurrentPrice(panel,data,selectionLabel);

      const hasPrice=primaryPrice(data)>0;
      const hasChart=hasTrend(data);
      const has=hasPrice||hasChart;
      const noTrades=data.kind==='no-trades'||data.noTrades;
      const scopeText=data.isReferenceChart
        ? `${data.chartScope||'参考履歴'}をチャート表示`
        : (hasChart?'選択条件の売買履歴':hasPrice?'選択条件の現在価格':noTrades?'取引はありません':'価格データを取得できません');
      showScope(panel,scopeText,data.isReferenceChart?'warn':(has?'ok':noTrades?'warn':'error'));
      status.textContent=has?'更新済み':noTrades?'取引なし':'取得不可';status.className='market-status '+(has?'ok':noTrades?'warn':'error');
      panel.dataset.loadedKey=key;
      foot.textContent=data.note||'';foot.hidden=!data.note;
    }catch(err){
      if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      console.error(err);
      status.textContent='取得不可';status.className='market-status error';
      svg.setAttribute('hidden','');empty.hidden=false;
      empty.textContent='SNKRDUNK側の制限で価格データを取得できませんでした。公式ページで確認してください。';
      metrics.innerHTML='';foot.hidden=true;
      renderCurrentPrice(panel,null,selectionLabel);
      showScope(panel,'外部データ取得エラー','error');
    }finally{
      if(panel.dataset.requestId===requestId)setMarketLoading(panel,false);
    }
  }

  function renderMetrics(panel,data){const metrics=$('.market-metrics',panel);metrics.innerHTML='';(data.metrics||[]).forEach(([k,v])=>{const d=document.createElement('div');d.className='market-metric';d.innerHTML=`<span>${k}</span><strong>${v||'—'}</strong>`;metrics.appendChild(d);});}
  function drawChart(panel,data,options={}){
    const svg=$('.market-chart',panel),empty=$('.market-empty',panel),guide=$('.market-chart-guide',panel);
    const preferredTime=Number.isFinite(Number(options.preferredTime))?Number(options.preferredTime):Number(panel.dataset.selectedTime);
    svg._chartMeta=null;if(guide)guide.hidden=true;
    if(data.kind==='trend'&&data.rawPoints?.length){
      const interval=panel.dataset.chartInterval||'month';
      const points=chartPointsFor(data,interval);
      const intervalLabel=interval==='year'?'1年足':'1か月足';
      const extra=interval==='year'?['年足',points.length+'年']:['月足',points.length+'か月'];
      renderMetrics(panel,{...data,metrics:[...(data.metrics||[]),extra]});
      if(points.length){
        drawTrendChart(svg,{...data,points,interval});svg.removeAttribute('hidden');empty.hidden=true;if(guide)guide.hidden=false;
        $('.market-chart-title',panel).textContent=`売買価格の推移（${intervalLabel}）${data.isReferenceChart?'・参考':''}`;
        let targetIndex=points.length-1;
        if(Number.isFinite(preferredTime)){
          let best=Infinity;
          points.forEach((p,i)=>{const d=Math.abs((Number(p.time)||0)-preferredTime);if(d<best){best=d;targetIndex=i;}});
        }
        selectChartPoint(panel,targetIndex,true);
        scrollChartToPoint(panel,targetIndex,{force:true,smooth:false});
        return;
      }
    }
    renderMetrics(panel,data);
    if(data.kind==='point'&&data.point>0){
      svg.setAttribute('hidden','');empty.hidden=false;empty.textContent='過去の取引はありません。';$('.market-chart-title',panel).textContent='取引履歴';return;
    }
    svg.setAttribute('hidden','');empty.hidden=false;
    if(data.kind==='no-trades'||data.noTrades){empty.textContent=data.unsupported||'取引はありません。';$('.market-chart-title',panel).textContent='取引履歴';}
    else{empty.textContent=data.unsupported||'価格データを取得できませんでした。';$('.market-chart-title',panel).textContent='価格情報';}
  }

  function drawPointChart(svg,data){
    const W=760,H=270,L=72,R=30,T=32,B=48,v=data.point,lo=Math.max(0,v*.78),hi=Math.max(v*1.22,v+1000),y=x=>T+(H-T-B)*(1-(x-lo)/(hi-lo||1));
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.width='100%';svg.style.height='270px';
    let s='';for(let i=0;i<5;i++){const yy=T+(H-T-B)*i/4,val=hi-(hi-lo)*i/4;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7e7e2"/><text x="${L-10}" y="${yy+3}" text-anchor="end" font-size="10" fill="#8b8b8b">${fmt(val)}</text>`;}
    const yy=y(v),cx=(L+W-R)/2;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#111" stroke-width="2" stroke-dasharray="5 5" opacity=".35"/><circle cx="${cx}" cy="${yy}" r="8" fill="#111"/><rect x="${cx-58}" y="${Math.max(5,yy-46)}" width="116" height="30" rx="15" fill="#111"/><text x="${cx}" y="${Math.max(25,yy-26)}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${fmt(v)}</text><text x="${cx}" y="${H-16}" text-anchor="middle" font-size="10" fill="#777">現在</text>`;svg.innerHTML=s;
  }

  function drawTrendChart(svg,data){
    const pts=data.points.filter(x=>Number.isFinite(x.value)&&x.value>0);
    const H=300,T=38,B=58;
    // v15: ブラウザの横スクロールに頼らず、SVGのviewBoxだけを動かす。
    // これで価格の玉が右端で切れず、玉をドラッグした方向へグラフが追従する。
    const interval=data.interval||'month';
    const idealGap=interval==='year'?190:118;
    const sidePad=100;
    const viewportWidth=1040;
    const contentSpan=Math.max(viewportWidth-sidePad*2,Math.max(1,pts.length-1)*idealGap);
    const pointGap=pts.length>1?contentSpan/(pts.length-1):0;
    const W=sidePad*2+contentSpan;
    const vals=pts.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals);
    const pad=Math.max((max-min)*.18,max*.035,500),lo=Math.max(0,min-pad),hi=max+pad;
    const x=(p,i)=>pts.length===1?W/2:sidePad+i*pointGap;
    const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
    const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p,i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    const area=`${path} L ${x(pts.at(-1),pts.length-1)} ${H-B} L ${x(pts[0],0)} ${H-B} Z`;

    svg.style.setProperty('width','100%','important');
    svg.style.setProperty('min-width','0','important');
    svg.style.setProperty('max-width','100%','important');
    svg.style.setProperty('height',`${H}px`,'important');

    let out=`<defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#111" stop-opacity=".13"/><stop offset="100%" stop-color="#111" stop-opacity="0"/></linearGradient></defs>`;
    for(let i=0;i<5;i++){
      const yy=T+(H-T-B)*i/4,val=hi-(hi-lo)*i/4;
      out+=`<line data-grid-line y1="${yy}" y2="${yy}" x1="0" x2="${W}" stroke="#e7e7e2"/>`;
      out+=`<text data-y-label y="${yy+3}" text-anchor="end" font-size="10" fill="#8b8b8b">${fmt(val)}</text>`;
    }
    out+=`<path d="${area}" fill="url(#trendArea)"/><path d="${path}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    const every=Math.max(1,Math.ceil(pts.length/9));
    pts.forEach((p,i)=>{
      const xx=x(p,i);
      if(i===0||i===pts.length-1||i%every===0)out+=`<text x="${xx}" y="${H-18}" text-anchor="middle" font-size="9" fill="#777">${p.label}</text>`;
    });
    out+=`<g class="chart-cursor" data-chart-cursor role="slider" aria-label="価格履歴カーソル" aria-valuemin="0" aria-valuemax="${Math.max(0,pts.length-1)}" aria-valuenow="${Math.max(0,pts.length-1)}" tabindex="0">
      <line class="chart-cursor-line" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="#111" stroke-width="1.5" stroke-dasharray="4 4" opacity=".32"/>
      <circle class="chart-cursor-hit" cx="0" cy="0" r="30" fill="transparent"/>
      <circle class="chart-cursor-halo" cx="0" cy="0" r="13" fill="#fff" stroke="#111" stroke-width="2"/>
      <circle class="chart-cursor-dot" cx="0" cy="0" r="6" fill="#111"/>
      <g class="chart-cursor-label">
        <rect class="chart-cursor-label-bg" x="0" y="0" width="88" height="28" rx="14" fill="#111"/>
        <text class="chart-cursor-price" x="44" y="18" text-anchor="middle" font-size="11" font-weight="900" fill="#fff"></text>
      </g>
    </g>`;
    svg.innerHTML=out;
    svg._chartMeta={
      points:pts.map((p,i)=>({...p,x:x(p,i),y:y(p.value)})),
      width:W,height:H,T,B,latestIndex:pts.length-1,
      viewportWidth:Math.min(viewportWidth,W),viewStart:Math.max(0,W-Math.min(viewportWidth,W))
    };
    setChartViewport(svg,svg._chartMeta.viewStart);
  }

  function setChartViewport(svg,start){
    const meta=svg?._chartMeta;if(!meta)return;
    const max=Math.max(0,meta.width-meta.viewportWidth);
    meta.viewStart=Math.max(0,Math.min(max,Number(start)||0));
    svg.setAttribute('viewBox',`${meta.viewStart} 0 ${meta.viewportWidth} ${meta.height}`);
    // Y軸の金額は常に表示範囲の左側に固定する。
    const axisX=meta.viewStart+62;
    $$('[data-y-label]',svg).forEach(t=>t.setAttribute('x',axisX));
    $$('[data-grid-line]',svg).forEach(line=>{
      line.setAttribute('x1',meta.viewStart+72);
      line.setAttribute('x2',meta.viewStart+meta.viewportWidth-24);
    });
  }

  function scrollChartToPoint(panel,index,{force=false,smooth=false}={}){
    const svg=$('.market-chart',panel),meta=svg?._chartMeta;
    if(!meta?.points?.length)return;
    index=Math.max(0,Math.min(meta.points.length-1,index));
    const p=meta.points[index],start=meta.viewStart,end=start+meta.viewportWidth;
    const safeLeft=start+meta.viewportWidth*.20,safeRight=start+meta.viewportWidth*.78;
    let next=start;
    if(force) next=p.x-meta.viewportWidth*.68;
    else if(p.x<safeLeft) next=p.x-meta.viewportWidth*.24;
    else if(p.x>safeRight) next=p.x-meta.viewportWidth*.72;
    if(next!==start)setChartViewport(svg,next);
  }

  function scrollChartToLatest(panel,smooth=false){
    const svg=$('.market-chart',panel),meta=svg?._chartMeta;if(!meta)return;
    // 最新ポイントの右側に余白を残した状態で表示する。
    const latest=meta.points[meta.latestIndex];
    setChartViewport(svg,latest.x-meta.viewportWidth*.78);
  }

  function autoPanChartBox(box,clientX){
    const svg=box?.querySelector?.('.market-chart'),meta=svg?._chartMeta;
    if(!svg||!meta||meta.width<=meta.viewportWidth)return;
    const r=svg.getBoundingClientRect();
    const edge=Math.min(90,r.width*.18);
    let shift=0;
    if(clientX<r.left+edge){
      const ratio=Math.min(1,(r.left+edge-clientX)/edge);
      shift=-(meta.viewportWidth*(.025+.055*ratio));
    }else if(clientX>r.right-edge){
      const ratio=Math.min(1,(clientX-(r.right-edge))/edge);
      shift=meta.viewportWidth*(.025+.055*ratio);
    }
    if(shift)setChartViewport(svg,meta.viewStart+shift);
  }

  function selectChartPoint(panel,index,updateCard=true){
    const svg=$('.market-chart',panel),meta=svg?._chartMeta;if(!meta?.points?.length)return;
    index=Math.max(0,Math.min(meta.points.length-1,index));
    svg.dataset.selectedIndex=String(index);
    const selectedPoint=meta.points[index];
    if(Number.isFinite(Number(selectedPoint?.time)))panel.dataset.selectedTime=String(Number(selectedPoint.time));
    // 先に表示範囲を追従させてから玉の吹き出し位置を計算する。
    scrollChartToPoint(panel,index,{force:false,smooth:false});
    const p=meta.points[index],cursor=$('[data-chart-cursor]',svg);if(!cursor)return;
    cursor.setAttribute('aria-valuenow',String(index));
    cursor.setAttribute('aria-valuetext',`${p.fullLabel||p.label||''} ${fmt(p.value)}`.trim());
    $('.chart-cursor-line',cursor).setAttribute('x1',p.x);$('.chart-cursor-line',cursor).setAttribute('x2',p.x);
    $$('.chart-cursor-hit,.chart-cursor-halo,.chart-cursor-dot',cursor).forEach(c=>{c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);});

    const label=$('.chart-cursor-label',cursor),bubbleW=88,bubbleH=28;
    const viewStart=meta.viewStart,viewEnd=viewStart+meta.viewportWidth;
    const bubbleX=Math.max(viewStart+82,Math.min(viewEnd-bubbleW-18,p.x-bubbleW/2));
    const placeBelow=p.y<meta.T+52;
    const bubbleY=placeBelow?Math.min(meta.height-meta.B-bubbleH-4,p.y+16):Math.max(4,p.y-bubbleH-16);
    label.setAttribute('transform',`translate(${bubbleX} ${bubbleY})`);
    $('.chart-cursor-price',cursor).textContent=fmt(p.value);

    if(updateCard){
      const current=$('.market-current',panel),latest=index===meta.latestIndex;
      if(current){
        $('span',current).textContent=latest?'現在の価格':'過去の価格';
        $('strong',current).textContent=fmt(p.value);
        $('small',current).textContent=p.fullLabel||p.label||'—';
        current.classList.toggle('is-history',!latest);
      }
    }
  }

  function chartIndexFromPointer(svg,clientX){
    const meta=svg?._chartMeta;if(!meta?.points?.length)return -1;
    const rect=svg.getBoundingClientRect();if(!rect.width)return -1;
    const vx=meta.viewStart+((clientX-rect.left)/rect.width)*meta.viewportWidth;
    let best=0,bestDist=Infinity;
    meta.points.forEach((p,i)=>{const d=Math.abs(p.x-vx);if(d<bestDist){best=i;bestDist=d;}});
    return best;
  }

  function bindMarketChartGestures(root){
    $$('.market-chart',root).forEach(svg=>{
      if(svg.dataset.gestureBound)return;
      svg.dataset.gestureBound='1';

      let draggingCursor=false;
      let cursorPointerId=null;
      let suppressClickUntil=0;
      const panel=()=>svg.closest('.market-source');
      const box=()=>svg.closest('.market-chart-box');

      const pointInsideSvg=e=>{
        const r=svg.getBoundingClientRect();
        return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
      };

      const pick=e=>{
        if(!svg._chartMeta||e?.clientX==null||!pointInsideSvg(e))return;
        const idx=chartIndexFromPointer(svg,e.clientX);
        if(idx>=0)selectChartPoint(panel(),idx,true);
      };

      const finishCursor=e=>{
        if(!draggingCursor)return;
        draggingCursor=false;
        const oldId=cursorPointerId;
        cursorPointerId=null;
        // ドラッグ終了後にブラウザが生成する click を完全に無視する。
        // viewBox が移動した後の座標で再選択され、最新へ飛ぶ現象を防ぐ。
        suppressClickUntil=performance.now()+700;
        svg.classList.remove('is-selecting');
        $('[data-chart-cursor]',svg)?.classList.remove('is-dragging');
        try{if(oldId!=null&&svg.hasPointerCapture?.(oldId))svg.releasePointerCapture(oldId);}catch{}
        e?.preventDefault?.();
        e?.stopPropagation?.();
      };

      svg.addEventListener('pointerdown',e=>{
        if(!svg._chartMeta)return;
        if(e.button!==undefined&&e.button!==0)return;
        const cursor=e.target.closest?.('[data-chart-cursor]');

        // pointerdownだけで選択を完結させる。
        // この後のclickでは再計算しないため、viewBox追従後に最新側へ飛ばない。
        suppressClickUntil=performance.now()+700;

        if(cursor){
          draggingCursor=true;
          cursorPointerId=e.pointerId;
          svg.classList.add('is-selecting');
          cursor.classList.add('is-dragging');
          try{svg.setPointerCapture?.(e.pointerId);}catch{}
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        pick(e);
        e.stopPropagation();
      });

      svg.addEventListener('pointermove',e=>{
        if(!draggingCursor||e.pointerId!==cursorPointerId)return;
        autoPanChartBox(box(),e.clientX);
        pick(e);
        e.preventDefault();
        e.stopPropagation();
      });

      svg.addEventListener('pointerup',e=>{
        if(draggingCursor&&e.pointerId===cursorPointerId)finishCursor(e);
      });
      svg.addEventListener('pointercancel',e=>{
        if(draggingCursor&&e.pointerId===cursorPointerId)finishCursor(e);
      });
      svg.addEventListener('lostpointercapture',e=>{
        if(draggingCursor)finishCursor(e);
      });

      // pointer操作の直後に発生するclickは選択処理をしない。
      // キーボード操作は下のkeydownで対応する。
      svg.addEventListener('click',e=>{
        if(performance.now()<suppressClickUntil){
          e.preventDefault();e.stopPropagation();return;
        }
        // pointerdownが発生しない特殊なclickだけフォールバックとして処理。
        if(e.detail===0&&e.clientX>0)pick(e);
      });

      const chartBox=box();
      if(chartBox&&!chartBox.dataset.tapBound){
        chartBox.dataset.tapBound='1';
        chartBox.addEventListener('wheel',e=>{
          if(!svg._chartMeta)return;
          const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
          if(!delta)return;
          setChartViewport(svg,svg._chartMeta.viewStart+delta*1.6);
          e.preventDefault();
        },{passive:false});
      }

      const sourcePanel=panel();

      svg.addEventListener('keydown',e=>{
        if(!svg._chartMeta)return;
        let idx=Number(svg.dataset.selectedIndex||svg._chartMeta.latestIndex);
        if(e.key==='ArrowLeft'){e.preventDefault();selectChartPoint(panel(),idx-1,true);}
        else if(e.key==='ArrowRight'){e.preventDefault();selectChartPoint(panel(),idx+1,true);}
        else if(e.key==='Home'){e.preventDefault();selectChartPoint(panel(),0,true);}
        else if(e.key==='End'){
          e.preventDefault();
          selectChartPoint(panel(),svg._chartMeta.latestIndex,true);
          scrollChartToLatest(panel(),false);
        }
      });
    });
  }

})();
