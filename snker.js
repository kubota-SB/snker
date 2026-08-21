
(() => {
  'use strict';
  const DATA_URL = 'sneakers.json?v=4';
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
  function bindDetail(item){detailAbort?.abort();detailAbort=new AbortController();const signal=detailAbort.signal,root=els.detail;$('.viewer-prev',root)?.addEventListener('click',()=>viewer&&showFrame(viewer.frame-1),{signal});$('.viewer-next',root)?.addEventListener('click',()=>viewer&&showFrame(viewer.frame+1),{signal});const stage=$('.viewer-stage',root);let dragging=false,lastX=0,rem=0;stage.addEventListener('pointerdown',e=>{if(!viewer||e.target.closest('button'))return;dragging=true;lastX=e.clientX;rem=0;stage.setPointerCapture?.(e.pointerId)},{signal});stage.addEventListener('pointermove',e=>{if(!dragging||!viewer)return;rem+=e.clientX-lastX;lastX=e.clientX;const steps=Math.trunc(rem/11);if(steps){rem-=steps*11;showFrame(viewer.frame-steps);}},{signal});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>stage.addEventListener(ev,()=>dragging=false,{signal}));root.addEventListener('toggle',e=>{const d=e.target;if(d.matches?.('.market-section')&&d.open)d.querySelectorAll('.market-source').forEach(p=>loadMarket(p));}, {capture:true,signal});root.addEventListener('click',marketClickHandler,{signal});root.addEventListener('change',marketChangeHandler,{signal});}

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
    const sn=getLink(item,'snkrdunk'),sx=getLink(item,'stockx');
    return `<details class="market-section"><summary>価格チャート － サイズ・新品 / 中古</summary><div class="market-inner"><p class="market-note">サイズ・状態を変更すると自動で再取得します。SNKRDUNKは取得できた日付付き売買履歴を価格推移として表示し、StockXは公開されている市場レンジを表示します。</p><div class="market-grid">${marketPanel('snkrdunk',sn,item.sku)}${marketPanel('stockx',sx,item.sku)}</div></div></details>`;
  }

  function marketPanel(source,url,sku){
    const name=source==='stockx'?'StockX':'SNKRDUNK', unit=source==='stockx'?'US':'CM';
    const sizes=source==='stockx'?['All','3.5','4','4.5','5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','16','17']:['All','22.5','23','23.5','24','24.5','25','25.5','26','26.5','27','27.5','28','28.5','29','29.5','30','30.5','31','31.5','32'];
    const def=source==='stockx'?'9':'27';
    const opts=sizes.map(x=>`<option ${x===def?'selected':''} value="${x}">${x}</option>`).join('');
    return `<section class="market-source ${source==='stockx'?'market-stockx':'market-snkr'}" data-source="${source}" data-url="${escapeAttr(url)}" data-sku="${escapeAttr(sku)}">
      <div class="market-source-head"><strong>${name}</strong><span class="market-status">未取得</span></div>
      <div class="market-controls"><label>サイズ (${unit}) <select class="market-size">${opts}</select></label><div class="market-condition"><button type="button" class="active" data-condition="new">新品</button><button type="button" data-condition="used">中古</button></div></div>
      <div class="market-chart-shell">
        <div class="market-chart-head"><span class="market-chart-title">価格推移</span><span class="market-selection"></span></div>
        <div class="market-chart-box">
          <div class="market-loading" hidden><span class="market-spinner"></span><span>価格情報を取得しています…</span></div>
          <div class="market-empty">チャートを開くと自動で読み込みます</div>
          <svg class="market-chart" hidden viewBox="0 0 620 250" role="img" aria-label="価格チャート"></svg>
        </div>
      </div>
      <div class="market-metrics"></div>
      <p class="market-footnote" hidden></p>
      <div class="market-actions">${url?`<a class="market-open" href="${escapeAttr(url)}" target="_blank" rel="noopener">${name}で確認</a>`:''}</div>
    </section>`;
  }
  function escapeAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function marketClickHandler(e){
    const cond=e.target.closest('.market-condition button');
    if(!cond)return;
    const panel=cond.closest('.market-source');
    $$('.market-condition button',panel).forEach(b=>b.classList.toggle('active',b===cond));
    loadMarket(panel,true);
  }
  function marketChangeHandler(e){if(e.target.matches('.market-size'))loadMarket(e.target.closest('.market-source'),true);}
  function readerUrl(url,bust=false){
    if(!url)return'';
    let target=url;
    if(bust){
      try{const u=new URL(url);u.searchParams.set('_archive_refresh',String(Math.floor(Date.now()/60000)));target=u.toString();}catch{}
    }
    return `https://r.jina.ai/${target}`;
  }
  function withParams(raw,source,size,condition){
    if(!raw)return'';
    try{
      const u=new URL(raw);
      if(source==='stockx'){
        const parts=u.pathname.split('/').filter(Boolean),loc=new Set(['ja-jp','en-gb','en','ko-kr','fr-fr','es-mx','es-es','de-de','it-it','zh-cn','zh-tw']);
        const slug=parts.find(p=>!loc.has(p.toLowerCase()));
        // 日本円表記を優先しつつ商品URLを正規化。
        u.hostname='stockx.com';u.pathname='/ja-jp/'+(slug||parts.at(-1)||'');u.search='';
        if(size&&size!=='All')u.searchParams.set('size',size);
        if(condition==='used')u.searchParams.set('condition','used');
      }else{
        u.search='';
        if(size&&size!=='All')u.searchParams.set('size',size);
        if(condition)u.searchParams.set('condition',condition);
        u.searchParams.set('slide','right');
      }
      return u.toString();
    }catch{return raw;}
  }

  async function fetchText(target,force=false,signal){
    const key='reader:'+target;
    if(!force&&marketCache.has(key))return marketCache.get(key);
    const local=new AbortController();
    const abort=()=>local.abort(); signal?.addEventListener('abort',abort,{once:true});
    const t=setTimeout(()=>local.abort(),12000);
    try{
      const r=await fetch(readerUrl(target,force),{signal:local.signal,cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const text=await r.text();
      if(text.length<120)throw new Error('empty response');
      marketCache.set(key,text);
      return text;
    }finally{
      clearTimeout(t);signal?.removeEventListener?.('abort',abort);
    }
  }

  const moneyRE=/(?:￥|¥|\$|£|€)\s*[\d,]+/g;
  const toNum=v=>Number(String(v||'').replace(/[^0-9.]/g,''))||0;
  const fmt=(n,c='¥')=>n?`${c}${Math.round(n).toLocaleString()}`:'—';
  const currencyOf=t=>(String(t).match(/[￥¥$£€]/)||['¥'])[0].replace('￥','¥');
  function nearestMoney(text,re){const m=text.match(re);if(!m)return null;return m[0].match(moneyRE)?.at(-1)||null;}
  function moneyPair(text,re){const m=text.match(re);if(!m)return null;const ms=m[0].match(moneyRE)||[];return ms.length>=2?[ms[ms.length-2],ms[ms.length-1]]:null;}

  function stockxData(text,condition){
    if(condition==='used'&&!/(Condition\s*:\s*Used|商品状態\s*[:：]\s*中古|Used Listings|Shop Used|中古)/i.test(text)){
      return {kind:'empty',unsupported:'StockXの中古は公開ページからサイズ別の取引履歴を安定して取得できません。StockXの商品ページで確認してください。'};
    }
    const buy=nearestMoney(text,/(?:Buy Now for|次の価格で今すぐ買う)[\s\S]{0,100}?(?:￥|¥|\$|£|€)\s*[\d,]+/i);
    const last=nearestMoney(text,/(?:Last Sale|最新の取引額)[\s\S]{0,75}?(?:￥|¥|\$|£|€)\s*[\d,]+/i);
    const sell=nearestMoney(text,/(?:(?:Sell Now for)[\s\S]{0,45}?(?:￥|¥|\$|£|€)\s*[\d,]+|(?:￥|¥|\$|£|€)\s*[\d,]+\s*で今すぐ売る)/i);
    const avg=nearestMoney(text,/(?:Average Sale Price|平均取引額)[\s\S]{0,150}?(?:Last 3 Months|過去3か月)[\s\S]{0,70}?(?:￥|¥|\$|£|€)\s*[\d,]+/i);
    const r12=moneyPair(text,/(?:Price Range|価格帯)[\s\S]{0,80}?(?:Last 12 Months|過去12か月)[\s\S]{0,90}?(?:￥|¥|\$|£|€)\s*[\d,]+\s*[-–〜~]\s*(?:￥|¥|\$|£|€)\s*[\d,]+/i);
    const r3=moneyPair(text,/(?:Price Range|価格帯)[\s\S]{0,80}?(?:Last 3 Months|過去3か月)[\s\S]{0,90}?(?:￥|¥|\$|£|€)\s*[\d,]+\s*[-–〜~]\s*(?:￥|¥|\$|£|€)\s*[\d,]+/i);
    const vals=[r12?.[0],r12?.[1],r3?.[0],r3?.[1],avg,last,buy,sell].filter(Boolean);
    const currency=currencyOf(vals[0]||'¥');
    const range12=r12?{low:toNum(r12[0]),high:toNum(r12[1])}:null;
    const range3=r3?{low:toNum(r3[0]),high:toNum(r3[1])}:null;
    const metrics=[['今すぐ買う',buy],['最新取引',last],['3か月平均',avg],['今すぐ売る',sell]].filter(x=>x[1]);
    if(range12||range3||last||buy){
      return {kind:'range',currency,range12,range3,last:toNum(last),buy:toNum(buy),metrics,note:'StockXの公開ページから取得した市場レンジです。日付ごとの実売履歴ではありません。'};
    }
    return {kind:'empty',currency,metrics,unsupported:'StockXの公開ページから市場データを取得できませんでした。'};
  }

  function normalizeDateLabel(s){
    const t=String(s||'').trim().replace(/[.-]/g,'/');
    const m=t.match(/^(20\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    if(m)return `${m[1].slice(2)}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}`;
    const md=t.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(md)return `${String(md[1]).padStart(2,'0')}/${String(md[2]).padStart(2,'0')}`;
    return t;
  }
  function dateValue(label){
    const s=String(label).replace(/[.-]/g,'/');
    let m=s.match(/^(20\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3]).getTime();
    m=s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(m){const now=new Date();return new Date(now.getFullYear(),+m[1]-1,+m[2]).getTime();}
    return NaN;
  }
  function snkrData(text){
    const hits=[];
    const add=(date,value)=>{
      value=toNum(value);if(!date||value<1000||value>2000000)return;
      const label=String(date).replace(/年|月/g,'/').replace(/日/g,'').replace(/[.-]/g,'/').replace(/\/$/,'');
      const key=label+'|'+value;if(hits.some(x=>x.key===key))return;
      hits.push({key,date:label,label:normalizeDateLabel(label),value,time:dateValue(label)});
    };
    const patterns=[
      {re:/(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})[\s\S]{0,140}?(?:￥|¥)\s*([\d,]+)/g,di:1,vi:2},
      {re:/(?:￥|¥)\s*([\d,]+)[\s\S]{0,140}?(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})/g,di:2,vi:1},
      {re:/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日[\s\S]{0,140}?(?:￥|¥)\s*([\d,]+)/g,jp:true},
      {re:/(\d{1,2})[\/.-](\d{1,2})[\s\S]{0,90}?(?:￥|¥)\s*([\d,]+)/g,md:true}
    ];
    for(const p of patterns){
      let m,guard=0;
      while((m=p.re.exec(text))&&guard++<120){
        if(p.jp)add(`${m[1]}/${m[2]}/${m[3]}`,m[4]);
        else if(p.md)add(`${m[1]}/${m[2]}`,m[3]);
        else add(m[p.di],m[p.vi]);
      }
      if(hits.length>=8)break;
    }
    hits.sort((a,b)=>(Number.isFinite(a.time)?a.time:0)-(Number.isFinite(b.time)?b.time:0));
    // 同一日付に複数価格がある場合も売買履歴として残すが、表示は直近36点まで。
    const points=hits.slice(-36).map(x=>({label:x.label,value:x.value,time:x.time}));
    if(points.length>=2){
      const vals=points.map(x=>x.value),latest=points.at(-1)?.value;
      return {kind:'trend',points,currency:'¥',metrics:[['最新',fmt(latest)],['最安',fmt(Math.min(...vals))],['最高',fmt(Math.max(...vals))],['取得件数',points.length+'件']],note:'SNKRDUNKの公開商品ページから取得できた日付付き価格情報'};
    }
    const current=(text.match(/(?:￥|¥)\s*[\d,]+\s*~/)||[])[0];
    const current2=nearestMoney(text,/(?:新品|販売価格|最安|購入)[\s\S]{0,80}?(?:￥|¥)\s*[\d,]+/i);
    const price=current?current.replace(/\s/g,''):current2;
    return {kind:'empty',currency:'¥',metrics:price?[['現在表示',price]]:[],unsupported:'日付付きの売買履歴を取得できませんでした。公式ページでは確認できる場合があります。'};
  }

  function setMarketLoading(panel,on){
    const loading=$('.market-loading',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel);
    if(loading)loading.hidden=!on;
    panel.classList.toggle('is-loading',!!on);
    if(on){if(empty)empty.hidden=true;if(svg)svg.hidden=true;}
  }
  function setSelectionLabel(panel,size,condition){
    const source=panel.dataset.source,unit=source==='stockx'?'US':'cm';
    const s=size==='All'?'全サイズ':`${size}${unit}`;
    $('.market-selection',panel).textContent=`${s} · ${condition==='used'?'中古':'新品'}`;
  }

  async function loadMarket(panel,force=false){
    const raw=panel.dataset.url,status=$('.market-status',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel),metrics=$('.market-metrics',panel),foot=$('.market-footnote',panel);
    if(!raw){status.textContent='リンクなし';status.className='market-status error';setMarketLoading(panel,false);empty.hidden=false;empty.textContent='このサイトの商品リンクが登録されていません。';svg.hidden=true;metrics.innerHTML='';foot.hidden=true;return;}
    const source=panel.dataset.source,size=$('.market-size',panel).value,condition=$('.market-condition button.active',panel)?.dataset.condition||'new';
    setSelectionLabel(panel,size,condition);
    const target=withParams(raw,source,size,condition);$('.market-open',panel)?.setAttribute('href',target);
    const key=`${source}|${target}|${condition}`;if(!force&&panel.dataset.loadedKey===key)return;

    panel._marketAbort?.abort();
    const ctrl=new AbortController();panel._marketAbort=ctrl;
    const requestId=String((Number(panel.dataset.requestId)||0)+1);panel.dataset.requestId=requestId;
    status.textContent='取得中';status.className='market-status';metrics.innerHTML='';foot.hidden=true;setMarketLoading(panel,true);
    try{
      const text=await fetchText(target,force,ctrl.signal);
      if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      let data=source==='stockx'?stockxData(text,condition):snkrData(text);
      // 選択サイズ付きURLで履歴が取れない場合は、全サイズの商品ページを一度だけ確認する。
      // その場合はサイズ別データと誤解されないよう注記する。
      if(data.kind==='empty' && size!=='All'){
        try{
          const fallbackTarget=withParams(raw,source,'All',condition);
          if(fallbackTarget!==target){
            const fallbackText=await fetchText(fallbackTarget,force,ctrl.signal);
            if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
            const fallbackData=source==='stockx'?stockxData(fallbackText,condition):snkrData(fallbackText);
            if(fallbackData.kind==='trend'||fallbackData.kind==='range'){
              data=fallbackData;
              data.note=`選択サイズの公開データを取得できなかったため、全サイズの情報を表示しています。 ${data.note||''}`.trim();
            }
          }
        }catch{}
      }
      drawChart(panel,data);
      panel.dataset.loadedKey=key;
      const hasVisual=data.kind==='trend'||data.kind==='range';
      status.textContent=hasVisual?'更新済み':data.metrics?.length?'一部取得':'取得不可';
      status.className='market-status '+(hasVisual?'ok':data.metrics?.length?'warn':'error');
      foot.textContent=data.note||'';foot.hidden=!data.note;
    }catch(err){
      if(panel.dataset.requestId!==requestId||ctrl.signal.aborted)return;
      status.textContent='取得不可';status.className='market-status error';
      svg.hidden=true;empty.hidden=false;empty.textContent='外部サイト側の制限で価格データを取得できませんでした。公式ページで確認してください。';metrics.innerHTML='';foot.hidden=true;
    }finally{
      if(panel.dataset.requestId===requestId)setMarketLoading(panel,false);
    }
  }

  function renderMetrics(panel,data){
    const metrics=$('.market-metrics',panel);metrics.innerHTML='';
    (data.metrics||[]).forEach(([k,v])=>{const d=document.createElement('div');d.className='market-metric';d.innerHTML=`<span>${k}</span><strong>${v||'—'}</strong>`;metrics.appendChild(d);});
  }
  function drawChart(panel,data){
    const svg=$('.market-chart',panel),empty=$('.market-empty',panel);
    renderMetrics(panel,data);
    if(data.kind==='trend'&&data.points?.length>=2){drawTrendChart(svg,data);svg.hidden=false;empty.hidden=true;$('.market-chart-title',panel).textContent='売買価格の推移';return;}
    if(data.kind==='range'){drawRangeChart(svg,data);svg.hidden=false;empty.hidden=true;$('.market-chart-title',panel).textContent='市場価格レンジ';return;}
    svg.hidden=true;empty.hidden=false;empty.textContent=data.unsupported||'価格履歴を取得できませんでした。';$('.market-chart-title',panel).textContent='価格情報';
  }

  function drawTrendChart(svg,data){
    const pts=data.points.filter(x=>Number.isFinite(x.value)&&x.value>0);const W=620,H=250,L=58,R=18,T=25,B=44;
    const vals=pts.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),pad=Math.max((max-min)*.18,max*.035,500),lo=Math.max(0,min-pad),hi=max+pad;
    const times=pts.map(x=>Number.isFinite(x.time)?x.time:null),validTimes=times.every(Number.isFinite)&&Math.max(...times)>Math.min(...times);
    const tMin=validTimes?Math.min(...times):0,tMax=validTimes?Math.max(...times):1;
    const x=(p,i)=>L+(W-L-R)*(validTimes?(p.time-tMin)/(tMax-tMin||1):i/(pts.length-1));
    const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
    const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p,i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    const area=`${path} L ${x(pts.at(-1),pts.length-1).toFixed(1)} ${H-B} L ${x(pts[0],0).toFixed(1)} ${H-B} Z`;
    let s=`<defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#111" stop-opacity=".16"/><stop offset="100%" stop-color="#111" stop-opacity="0"/></linearGradient></defs>`;
    for(let i=0;i<5;i++){const yy=T+(H-T-B)*i/4,val=hi-(hi-lo)*i/4;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7e7e2" stroke-width="1"/><text x="${L-9}" y="${yy+3}" text-anchor="end" font-size="9" fill="#8b8b8b">${fmt(val,data.currency)}</text>`;}
    s+=`<path d="${area}" fill="url(#trendArea)"/><path d="${path}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    const labelIdx=[0,Math.floor((pts.length-1)/2),pts.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    labelIdx.forEach(i=>{const p=pts[i];s+=`<text x="${x(p,i)}" y="${H-15}" text-anchor="${i===0?'start':i===pts.length-1?'end':'middle'}" font-size="9" fill="#777">${p.label}</text>`;});
    const last=pts.at(-1),lx=x(last,pts.length-1),ly=y(last.value);
    s+=`<circle cx="${lx}" cy="${ly}" r="5" fill="#111"/><circle cx="${lx}" cy="${ly}" r="9" fill="none" stroke="#111" stroke-opacity=".18" stroke-width="4"/><rect x="${Math.max(L,Math.min(W-R-90,lx-45))}" y="${Math.max(3,ly-34)}" width="90" height="24" rx="12" fill="#111"/><text x="${Math.max(L+45,Math.min(W-R-45,lx))}" y="${Math.max(19,ly-18)}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">${fmt(last.value,data.currency)}</text>`;
    svg.innerHTML=s;
  }

  function drawRangeChart(svg,data){
    const ranges=[['過去12か月',data.range12],['過去3か月',data.range3]].filter(x=>x[1]&&x[1].high>=x[1].low);
    const extra=[data.last,data.buy].filter(v=>Number.isFinite(v)&&v>0),all=ranges.flatMap(x=>[x[1].low,x[1].high]).concat(extra);
    if(!all.length){svg.innerHTML='';return;}
    const W=620,H=250,L=86,R=22,T=28,B=42,min=Math.min(...all),max=Math.max(...all),pad=Math.max((max-min)*.12,max*.04,1),lo=Math.max(0,min-pad),hi=max+pad;
    const x=v=>L+(W-L-R)*(v-lo)/(hi-lo||1);let s='';
    for(let i=0;i<5;i++){const xx=L+(W-L-R)*i/4,val=lo+(hi-lo)*i/4;s+=`<line x1="${xx}" y1="${T}" x2="${xx}" y2="${H-B}" stroke="#ecece7"/><text x="${xx}" y="${H-15}" text-anchor="middle" font-size="9" fill="#858585">${fmt(val,data.currency)}</text>`;}
    ranges.forEach(([label,r],i)=>{const yy=74+i*66;s+=`<text x="${L-12}" y="${yy+4}" text-anchor="end" font-size="10" font-weight="800" fill="#555">${label}</text><line x1="${x(r.low)}" y1="${yy}" x2="${x(r.high)}" y2="${yy}" stroke="#111" stroke-width="8" stroke-linecap="round"/><circle cx="${x(r.low)}" cy="${yy}" r="5" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="${x(r.high)}" cy="${yy}" r="5" fill="#fff" stroke="#111" stroke-width="2"/><text x="${x(r.low)}" y="${yy-13}" text-anchor="middle" font-size="9" fill="#555">${fmt(r.low,data.currency)}</text><text x="${x(r.high)}" y="${yy-13}" text-anchor="middle" font-size="9" fill="#555">${fmt(r.high,data.currency)}</text>`;});
    if(data.last){const xx=x(data.last);s+=`<line x1="${xx}" y1="${T}" x2="${xx}" y2="${H-B}" stroke="#111" stroke-dasharray="4 4" stroke-opacity=".4"/><rect x="${Math.max(L,Math.min(W-R-84,xx-42))}" y="${T-4}" width="84" height="22" rx="11" fill="#111"/><text x="${Math.max(L+42,Math.min(W-R-42,xx))}" y="${T+11}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">最新 ${fmt(data.last,data.currency)}</text>`;}
    svg.innerHTML=s;
  }

})();
