
(() => {
  'use strict';
  const DATA_URL = 'sneakers.json?v=10';
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
        <img class="card-image" alt="" loading="lazy" decoding="async">
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
  function staticCandidates(item){
    // 一覧はまず登録済み画像を即表示。推測StockX URLを先に大量確認しない。
    const arr=[]; const original=item.image||'';
    if(original) arr.push(original);
    if(hasStockx(item)) folderCandidates(item).slice(0,2).forEach(f=>arr.push(normalStockx(f,'jpg')));
    if(item.sku) arr.push(`https://cdn.snkrdunk.com/uploads/sneaker-images/${encodeURIComponent(item.sku)}.jpg?size=l`);
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
        <div class="viewer-stage"><img class="viewer-image" alt="" draggable="false"><span class="viewer-badge" hidden>360° VIEW</span><button class="viewer-arrow viewer-prev" type="button" hidden>‹</button><button class="viewer-arrow viewer-next" type="button" hidden>›</button><span class="viewer-help" hidden>ドラッグ / スワイプで回転</span><span class="viewer-count" hidden>1 / 36</span></div>
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
    return `<details class="market-section" open><summary>SNKRDUNK 価格チャート － サイズ・新品 / 中古</summary><div class="market-inner"><p class="market-note">SNKRDUNKの公開価格情報だけを表示します。グラフ上の丸を左右にドラッグすると、その時点の日付と価格を確認できます。</p><div class="market-grid">${marketPanel(sn,item.sku)}</div></div></details>`;
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
        <div class="market-chart-head"><span class="market-chart-title">売買価格の推移</span><span class="market-selection">全サイズ · 新品</span></div>
        <div class="market-scope" hidden></div>
        <div class="market-chart-guide" hidden>
          <span>● を左右にドラッグして過去の価格を確認</span>
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
    const reset=e.target.closest('[data-chart-reset]');
    if(reset){
      const panel=reset.closest('.market-source'),svg=$('.market-chart',panel);
      const pts=svg?._chartMeta?.points;
      if(pts?.length) selectChartPoint(panel,pts.length-1,true);
    }
  }

  function marketChangeHandler(e){
    if(!e.target.matches('.market-size'))return;
    const panel=e.target.closest('.market-source');
    panel.dataset.loadedKey='';
    clearMarketVisual(panel);
    loadMarket(panel,true);
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

  function extractCurrentPrices(text,size='All'){
    const contexts=sizeContexts(text,size),prices=[];
    for(const chunk of contexts){
      const ms=chunk.match(moneyRE)||[];
      for(const v of ms){const n=toNum(v);if(n>=1000&&n<=2000000)prices.push(n);}
    }
    return [...new Set(prices)].sort((a,b)=>a-b);
  }

  function parseSnkrData(text,condition,size){
    const section=extractConditionSection(text,condition);
    if(!section){return {kind:'empty',metrics:[],unsupported:`${condition==='used'?'中古':'新品'}の売買履歴を新品と分離して取得できませんでした。誤って同じチャートを表示しないため非表示にしています。`};}
    let points=extractTransactions(section,size);
    if(size!=='All'&&points.length<2){
      // サイズ表記が別カラム/別行の場合に備えて、そのサイズ周辺の文脈からもう一度抽出。
      const joined=sizeContexts(section,size).join('\n');
      points=extractTransactions(joined,'All');
    }
    if(points.length>=2){
      const vals=points.map(x=>x.value),latest=points.at(-1).value;
      return {kind:'trend',points,currency:'¥',metrics:[['最新',fmt(latest)],['最安',fmt(Math.min(...vals))],['最高',fmt(Math.max(...vals))],['履歴',points.length+'件']],note:`SNKRDUNK公開ページから取得できた${condition==='used'?'中古':'新品'}の売買履歴です。`};
    }
    const prices=extractCurrentPrices(section,size);
    if(prices.length){
      const point=prices[0];
      return {kind:'point',point,currency:'¥',metrics:[['現在の最安',fmt(point)],['確認価格数',prices.length+'件'],['価格帯',prices.length>1?`${fmt(prices[0])}〜${fmt(prices.at(-1))}`:fmt(point)]],note:`${condition==='used'?'中古':'新品'}の現在価格は取得できましたが、日付付き履歴は十分に取得できませんでした。`};
    }
    return {kind:'empty',metrics:[],unsupported:`${size==='All'?'全サイズ':size+'cm'}・${condition==='used'?'中古':'新品'}の価格履歴を取得できませんでした。`};
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
  function primaryPrice(data){if(!data)return 0;if(data.kind==='trend')return data.points?.at(-1)?.value||0;if(data.kind==='point')return data.point||0;return 0;}
  function renderCurrentPrice(panel,data,label=''){
    const box=$('.market-current',panel);if(!box)return;const price=primaryPrice(data);$('strong',box).textContent=price?fmt(price):'—';$('small',box).textContent=label||($('.market-selection',panel)?.textContent||'');
  }

  async function loadMarket(panel,force=false){
    const raw=panel.dataset.url,status=$('.market-status',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel),metrics=$('.market-metrics',panel),foot=$('.market-footnote',panel);
    if(!raw){status.textContent='リンクなし';status.className='market-status error';setMarketLoading(panel,false);empty.hidden=false;empty.textContent='SNKRDUNKの商品リンクがありません。';return;}
    const size=$('.market-size',panel).value,condition=$('.market-condition button.active',panel)?.dataset.condition||'new';
    setSelectionLabel(panel,size,condition);
    const target=withSnkrParams(raw,size,condition);$('.market-open',panel)?.setAttribute('href',target);
    const key=`${target}|${condition}|${size}`;if(!force&&panel.dataset.loadedKey===key)return;
    panel._marketAbort?.abort();const ctrl=new AbortController();panel._marketAbort=ctrl;
    const requestId=String((Number(panel.dataset.requestId)||0)+1);panel.dataset.requestId=requestId;
    status.textContent='取得中';status.className='market-status';clearMarketVisual(panel,'選択条件の価格を取得しています…');setMarketLoading(panel,true);
    try{
      const text=await fetchText(target,force,ctrl.signal);if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      const data=parseSnkrData(text,condition,size);
      drawChart(panel,data);
      renderCurrentPrice(panel,data,`${size==='All'?'全サイズ':size+'cm'} · ${condition==='used'?'中古':'新品'}`);
      const has=primaryPrice(data)>0 || (data.kind==='trend'&&data.points?.length>=2);
      showScope(panel,has?'選択条件の公開データ':'選択条件の履歴を分離できません',has?'ok':'warn');
      status.textContent=has?'更新済み':'取得不可';status.className='market-status '+(has?'ok':'error');
      panel.dataset.loadedKey=key;foot.textContent=data.note||'';foot.hidden=!data.note;
    }catch(err){
      if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      status.textContent='取得不可';status.className='market-status error';svg.setAttribute('hidden','');empty.hidden=false;empty.textContent='SNKRDUNK側の制限で価格データを取得できませんでした。公式ページで確認してください。';metrics.innerHTML='';foot.hidden=true;renderCurrentPrice(panel,null,`${size==='All'?'全サイズ':size+'cm'} · ${condition==='used'?'中古':'新品'}`);showScope(panel,'外部データ取得エラー','error');
    }finally{if(panel.dataset.requestId===requestId)setMarketLoading(panel,false);}
  }

  function renderMetrics(panel,data){const metrics=$('.market-metrics',panel);metrics.innerHTML='';(data.metrics||[]).forEach(([k,v])=>{const d=document.createElement('div');d.className='market-metric';d.innerHTML=`<span>${k}</span><strong>${v||'—'}</strong>`;metrics.appendChild(d);});}
  function drawChart(panel,data){
    const svg=$('.market-chart',panel),empty=$('.market-empty',panel),guide=$('.market-chart-guide',panel);
    renderMetrics(panel,data);svg._chartMeta=null;if(guide)guide.hidden=true;
    if(data.kind==='trend'&&data.points?.length>=2){
      drawTrendChart(svg,data);svg.removeAttribute('hidden');empty.hidden=true;if(guide)guide.hidden=false;
      $('.market-chart-title',panel).textContent='売買価格の推移';
      selectChartPoint(panel,data.points.length-1,true);
      return;
    }
    if(data.kind==='point'&&data.point>0){drawPointChart(svg,data);svg.removeAttribute('hidden');empty.hidden=true;$('.market-chart-title',panel).textContent='現在価格（履歴未取得）';return;}
    svg.setAttribute('hidden','');empty.hidden=false;empty.textContent=data.unsupported||'価格履歴を取得できませんでした。';$('.market-chart-title',panel).textContent='価格情報';
  }

  function drawPointChart(svg,data){
    const W=760,H=270,L=72,R=30,T=32,B=48,v=data.point,lo=Math.max(0,v*.78),hi=Math.max(v*1.22,v+1000),y=x=>T+(H-T-B)*(1-(x-lo)/(hi-lo||1));
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.width='100%';svg.style.height='270px';
    let s='';for(let i=0;i<5;i++){const yy=T+(H-T-B)*i/4,val=hi-(hi-lo)*i/4;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7e7e2"/><text x="${L-10}" y="${yy+3}" text-anchor="end" font-size="10" fill="#8b8b8b">${fmt(val)}</text>`;}
    const yy=y(v),cx=(L+W-R)/2;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#111" stroke-width="2" stroke-dasharray="5 5" opacity=".35"/><circle cx="${cx}" cy="${yy}" r="8" fill="#111"/><rect x="${cx-58}" y="${Math.max(5,yy-46)}" width="116" height="30" rx="15" fill="#111"/><text x="${cx}" y="${Math.max(25,yy-26)}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${fmt(v)}</text><text x="${cx}" y="${H-16}" text-anchor="middle" font-size="10" fill="#777">現在</text>`;svg.innerHTML=s;
  }

  function drawTrendChart(svg,data){
    const pts=data.points.filter(x=>Number.isFinite(x.value)&&x.value>0),W=760,H=270,L=72,R=30,T=30,B=52;
    const vals=pts.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),pad=Math.max((max-min)*.18,max*.035,500),lo=Math.max(0,min-pad),hi=max+pad;
    const x=(p,i)=>L+(W-L-R)*(pts.length===1?.5:i/(pts.length-1)),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
    const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p,i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '),area=`${path} L ${x(pts.at(-1),pts.length-1)} ${H-B} L ${x(pts[0],0)} ${H-B} Z`;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.width='100%';svg.style.height='270px';
    let s=`<defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#111" stop-opacity=".13"/><stop offset="100%" stop-color="#111" stop-opacity="0"/></linearGradient></defs>`;
    for(let i=0;i<5;i++){const yy=T+(H-T-B)*i/4,val=hi-(hi-lo)*i/4;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7e7e2"/><text x="${L-10}" y="${yy+3}" text-anchor="end" font-size="10" fill="#8b8b8b">${fmt(val)}</text>`;}
    s+=`<path d="${area}" fill="url(#trendArea)"/><path d="${path}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    const every=Math.max(1,Math.ceil(pts.length/6));
    pts.forEach((p,i)=>{const xx=x(p,i),yy=y(p.value);if(i===0||i===pts.length-1||i%every===0)s+=`<text x="${xx}" y="${H-18}" text-anchor="middle" font-size="9" fill="#777">${p.label}</text>`;});
    s+=`<g class="chart-cursor" data-chart-cursor>
      <line class="chart-cursor-line" x1="0" y1="${T}" x2="0" y2="${H-B}" stroke="#111" stroke-width="1.5" stroke-dasharray="4 4" opacity=".32"/>
      <circle class="chart-cursor-halo" cx="0" cy="0" r="13" fill="#fff" stroke="#111" stroke-width="2"/>
      <circle class="chart-cursor-dot" cx="0" cy="0" r="6" fill="#111"/>
      <g class="chart-cursor-label">
        <rect x="0" y="0" width="86" height="28" rx="14" fill="#111"/>
        <text class="chart-cursor-price" x="43" y="18" text-anchor="middle" font-size="11" font-weight="900" fill="#fff"></text>
      </g>
    </g>`;
    svg.innerHTML=s;
    svg._chartMeta={points:pts.map((p,i)=>({...p,x:x(p,i),y:y(p.value)})),width:W,height:H,L,R,T,B,latestIndex:pts.length-1};
  }

  function selectChartPoint(panel,index,updateCard=true){
    const svg=$('.market-chart',panel),meta=svg?._chartMeta;if(!meta?.points?.length)return;
    index=Math.max(0,Math.min(meta.points.length-1,index));svg.dataset.selectedIndex=String(index);
    const p=meta.points[index],cursor=$('[data-chart-cursor]',svg);if(!cursor)return;
    $('.chart-cursor-line',cursor).setAttribute('x1',p.x);$('.chart-cursor-line',cursor).setAttribute('x2',p.x);
    $$('.chart-cursor-halo,.chart-cursor-dot',cursor).forEach(c=>{c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);});
    const label=$('.chart-cursor-label',cursor),bubbleW=86,bubbleH=28;
    const bubbleX=Math.max(meta.L+4,Math.min(meta.width-meta.R-bubbleW-4,p.x-bubbleW/2));
    const placeBelow=p.y < meta.T+52;
    const bubbleY=placeBelow?Math.min(meta.height-meta.B-bubbleH-4,p.y+16):Math.max(4,p.y-bubbleH-16);
    label.setAttribute('transform',`translate(${bubbleX} ${bubbleY})`);$('.chart-cursor-price',cursor).textContent=fmt(p.value);
    if(updateCard){
      const current=$('.market-current',panel),size=$('.market-size',panel)?.value||'All',condition=$('.market-condition button.active',panel)?.dataset.condition||'new',latest=index===meta.latestIndex;
      if(current){$('span',current).textContent=latest?'現在の価格':'過去の価格';$('strong',current).textContent=fmt(p.value);$('small',current).textContent=p.label||'—';current.classList.toggle('is-history',!latest);}
    }
  }

  function chartIndexFromPointer(svg,clientX){
    const meta=svg?._chartMeta;if(!meta?.points?.length)return -1;const rect=svg.getBoundingClientRect();if(!rect.width)return -1;
    const vx=(clientX-rect.left)*(meta.width/rect.width);let best=0,bestDist=Infinity;meta.points.forEach((p,i)=>{const d=Math.abs(p.x-vx);if(d<bestDist){best=i;bestDist=d;}});return best;
  }

  function bindMarketChartGestures(root){
    $$('.market-chart',root).forEach(svg=>{
      if(svg.dataset.gestureBound)return;svg.dataset.gestureBound='1';let dragging=false;
      const pick=e=>{if(!svg._chartMeta)return;const idx=chartIndexFromPointer(svg,e.clientX);if(idx>=0)selectChartPoint(svg.closest('.market-source'),idx,true);};
      svg.addEventListener('pointerdown',e=>{if(!svg._chartMeta)return;dragging=true;svg.classList.add('is-selecting');svg.setPointerCapture?.(e.pointerId);pick(e);e.preventDefault();});
      svg.addEventListener('pointermove',e=>{if(dragging)pick(e);});
      ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>svg.addEventListener(ev,()=>{dragging=false;svg.classList.remove('is-selecting');}));
      svg.addEventListener('click',e=>pick(e));
      svg.addEventListener('keydown',e=>{if(!svg._chartMeta)return;let idx=Number(svg.dataset.selectedIndex||svg._chartMeta.latestIndex);if(e.key==='ArrowLeft'){e.preventDefault();selectChartPoint(svg.closest('.market-source'),idx-1,true);}else if(e.key==='ArrowRight'){e.preventDefault();selectChartPoint(svg.closest('.market-source'),idx+1,true);}else if(e.key==='Home'){e.preventDefault();selectChartPoint(svg.closest('.market-source'),0,true);}else if(e.key==='End'){e.preventDefault();selectChartPoint(svg.closest('.market-source'),svg._chartMeta.latestIndex,true);}});
    });
  }

})();
