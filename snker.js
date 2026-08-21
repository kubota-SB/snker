
(() => {
  'use strict';
  const DATA_URL = 'sneakers.json';
  const FRAME_COUNT = 36;
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
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
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
  function staticCandidates(item){const arr=[]; const original=item.image||''; if(/images\.stockx\.com/i.test(original))arr.push(original); if(hasStockx(item))folderCandidates(item).slice(0,4).forEach(f=>{arr.push(normalStockx(f,'jpg'),normalStockx(f,'png'));}); if(original&&!arr.includes(original))arr.push(original); if(item.sku){arr.push(`https://cdn.snkrdunk.com/uploads/sneaker-images/${encodeURIComponent(item.sku)}.jpg?size=l`,`https://cdn.snkrdunk.com/uploads/sneaker-images/${encodeURIComponent(item.sku)}.png?size=l`);} return [...new Set(arr.filter(Boolean))];}
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
    status.textContent='StockXの360°画像を確認しています…';
    const openedItemId=item.id;
    for(const folder of folderCandidates(item)){
      for(const level of ['Lv2','Lv1']){
        if(currentItem?.id!==openedItemId)return;
        if(!await probeImage(frameUrl(folder,1,level),3000))continue;
        if(currentItem?.id!==openedItemId)return;
        if(!await probeImage(frameUrl(folder,18,level),3000))continue;
        if(currentItem?.id!==openedItemId)return;
        viewer={folder,level,frame:1};
        enableViewer();
        status.textContent='左右ドラッグ / スワイプ / 矢印で回転';
        return;
      }
    }
    if(currentItem?.id===openedItemId) status.textContent='このモデルは静止画で表示しています';
  }
  function enableViewer(){const stage=$('.viewer-stage',els.detail),img=$('.viewer-image',els.detail);stage.classList.add('has-360');['.viewer-badge','.viewer-prev','.viewer-next','.viewer-help','.viewer-count'].forEach(s=>$(s,els.detail).hidden=false);showFrame(1);preloadFrames(1);}
  function showFrame(frame){if(!viewer)return;viewer.frame=((frame-1+FRAME_COUNT)%FRAME_COUNT)+1;const img=$('.viewer-image',els.detail);img.style.display='block';img.src=frameUrl(viewer.folder,viewer.frame,viewer.level);$('.viewer-count',els.detail).textContent=`${viewer.frame} / ${FRAME_COUNT}`;preloadFrames(viewer.frame);}
  function preloadFrames(frame){if(!viewer)return;[-2,-1,1,2].forEach(o=>{const f=((frame-1+o+FRAME_COUNT)%FRAME_COUNT)+1;const im=new Image();im.src=frameUrl(viewer.folder,f,viewer.level)});}

  function marketMarkup(item){const sn=getLink(item,'snkrdunk'),sx=getLink(item,'stockx');return `<details class="market-section"><summary>価格チャート － サイズ・新品 / 中古</summary><div class="market-inner"><p class="market-note">チャートを開くと自動で最新の公開情報を確認します。サイズ・状態を変更すると自動更新します。</p><div class="market-grid">${marketPanel('snkrdunk',sn,item.sku)}${marketPanel('stockx',sx,item.sku)}</div></div></details>`;}
  function marketPanel(source,url,sku){
    const name=source==='stockx'?'StockX':'SNKRDUNK', unit=source==='stockx'?'US':'CM';
    const sizes=source==='stockx'?['All','3.5','4','4.5','5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','16','17']:['All','22.5','23','23.5','24','24.5','25','25.5','26','26.5','27','27.5','28','28.5','29','29.5','30','30.5','31','31.5','32'];
    const def=source==='stockx'?'9':'27';
    const opts=sizes.map(x=>`<option ${x===def?'selected':''} value="${x}">${x}</option>`).join('');
    return `<section class="market-source ${source==='stockx'?'market-stockx':'market-snkr'}" data-source="${source}" data-url="${escapeAttr(url)}" data-sku="${escapeAttr(sku)}"><div class="market-source-head"><strong>${name}</strong><span class="market-status">未取得</span></div><div class="market-controls"><label>サイズ (${unit}) <select class="market-size">${opts}</select></label><div class="market-condition"><button type="button" class="active" data-condition="new">新品</button><button type="button" data-condition="used">中古</button></div></div><div class="market-chart-box"><div class="market-empty">チャートを開くと自動で読み込みます</div><svg class="market-chart" hidden viewBox="0 0 520 190"></svg></div><div class="market-metrics"></div><div class="market-actions">${url?`<a class="market-open" href="${escapeAttr(url)}" target="_blank" rel="noopener">${name}で確認</a>`:''}</div></section>`;
  }
  function escapeAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function marketClickHandler(e){const cond=e.target.closest('.market-condition button');if(cond){const p=cond.closest('.market-source');$$('.market-condition button',p).forEach(b=>b.classList.toggle('active',b===cond));loadMarket(p,true);}}
  function marketChangeHandler(e){if(e.target.matches('.market-size'))loadMarket(e.target.closest('.market-source'),true);}
  function readerUrl(url){return url?`https://r.jina.ai/${url}`:'';}
  function withParams(raw,source,size,condition){if(!raw)return'';try{const u=new URL(raw);if(source==='stockx'){const parts=u.pathname.split('/').filter(Boolean);const loc=new Set(['ja-jp','en-gb','ko-kr','fr-fr','es-mx','es-es','de-de','it-it','zh-cn','zh-tw']);const slug=parts.find(p=>!loc.has(p.toLowerCase()));u.hostname='stockx.com';u.pathname='/'+(slug||parts.at(-1)||'');u.search='';if(size&&size!=='All')u.searchParams.set('size',size);if(condition==='used')u.searchParams.set('condition','used');}else{if(size&&size!=='All')u.searchParams.set('size',size);if(condition)u.searchParams.set('condition',condition);}return u.toString();}catch{return raw;}}
  async function fetchText(target,force=false){const key='reader:'+target;if(!force&&marketCache.has(key))return marketCache.get(key);const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(readerUrl(target),{signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const text=await r.text();marketCache.set(key,text);return text;}finally{clearTimeout(t);}}
  const moneyRE=/(?:￥|¥|\$|£|€)\s*[\d,]+/g; const toNum=v=>Number(String(v||'').replace(/[^0-9.]/g,''))||0; const fmt=(n,c='¥')=>n?`${c}${Math.round(n).toLocaleString()}`:'—'; const currencyOf=t=>(String(t).match(/[￥¥$£€]/)||['¥'])[0].replace('￥','¥');
  function nearestMoney(text,re){const m=text.match(re);if(!m)return null;return m[0].match(moneyRE)?.at(-1)||null;}
  function stockxData(text,condition){if(condition==='used'&&!/(Condition\s*:\s*Used|商品状態\s*[:：]\s*中古|Used Listings|中古)/i.test(text))return{unsupported:'StockX中古は公開商品ページから安定して履歴取得できません。'};const buy=nearestMoney(text,/(?:Buy Now for|次の価格で今すぐ買う)[\s\S]{0,80}?(?:￥|¥|\$|£|€)\s*[\d,]+/i),last=nearestMoney(text,/(?:Last Sale|最新の取引額)[\s\S]{0,55}?(?:￥|¥|\$|£|€)\s*[\d,]+/i),sell=nearestMoney(text,/(?:(?:Sell Now for)[\s\S]{0,35}?(?:￥|¥|\$|£|€)\s*[\d,]+|(?:￥|¥|\$|£|€)\s*[\d,]+\s*で今すぐ売る)/i),avg=nearestMoney(text,/(?:Average Sale Price|平均取引額)[\s\S]{0,110}?(?:Last 3 Months|過去3か月)[\s\S]{0,55}?(?:￥|¥|\$|£|€)\s*[\d,]+/i);let r12=null,r3=null;const m12=text.match(/(?:Price Range|価格帯)[\s\S]{0,65}?(?:Last 12 Months|過去12か月)[\s\S]{0,55}?((?:￥|¥|\$|£|€)\s*[\d,]+)\s*[-–]\s*((?:￥|¥|\$|£|€)\s*[\d,]+)/i);if(m12)r12=[m12[1],m12[2]];const m3=text.match(/(?:Price Range|価格帯)[\s\S]{0,65}?(?:Last 3 Months|過去3か月)[\s\S]{0,55}?((?:￥|¥|\$|£|€)\s*[\d,]+)\s*[-–]\s*((?:￥|¥|\$|£|€)\s*[\d,]+)/i);if(m3)r3=[m3[1],m3[2]];const vals=[r12?.[0],r3?.[0],avg,last,buy].filter(Boolean),currency=currencyOf(vals[0]||'¥'),points=[];if(r12?.[0])points.push({label:'12M LOW',value:toNum(r12[0])});if(r3?.[0])points.push({label:'3M LOW',value:toNum(r3[0])});if(avg)points.push({label:'3M AVG',value:toNum(avg)});if(last)points.push({label:'LAST',value:toNum(last)});if(buy)points.push({label:'BUY',value:toNum(buy)});return{points,currency,metrics:[['今すぐ買う',buy],['最新取引',last],['3か月平均',avg],['今すぐ売る',sell]].filter(x=>x[1]),note:'公開ページの市場指標（実売履歴の完全な時系列ではありません）'};}
  function snkrData(text){const h=[],patterns=[/(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})[\s\S]{0,90}?(?:￥|¥)\s*([\d,]+)/g,/(?:￥|¥)\s*([\d,]+)[\s\S]{0,90}?(20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2})/g];for(const [idx,re] of patterns.entries()){let m;while((m=re.exec(text))&&h.length<24){const date=idx===0?m[1]:m[2],value=toNum(idx===0?m[2]:m[1]);if(value>1000&&!h.some(x=>x.date===date&&x.value===value))h.push({date,value});}if(h.length>=2)break;}h.sort((a,b)=>new Date(a.date)-new Date(b.date));if(h.length>=2)return{points:h.slice(-12).map(x=>({label:x.date.replace(/^20/,'').replace(/[.-]/g,'/'),value:x.value})),currency:'¥',metrics:[['直近',fmt(h.at(-1).value)],['取得件数',h.length+'件']],note:'公開ページから取得できた売買履歴'};const current=(text.match(/(?:￥|¥)\s*[\d,]+\s*~/)||[])[0];return{points:[],currency:'¥',metrics:current?[['現在表示',current.replace(/\s/g,'')]]:[],unsupported:'公開ページから履歴点を取得できませんでした。公式ページで確認してください。'};}
  async function loadMarket(panel,force=false){
    const raw=panel.dataset.url,status=$('.market-status',panel),empty=$('.market-empty',panel),svg=$('.market-chart',panel),metrics=$('.market-metrics',panel);
    if(!raw){status.textContent='リンクなし';status.className='market-status error';empty.hidden=false;empty.textContent='このサイトの商品リンクが登録されていません。';svg.hidden=true;metrics.innerHTML='';return;}
    const source=panel.dataset.source,size=$('.market-size',panel).value,condition=$('.market-condition button.active',panel)?.dataset.condition||'new';
    const target=withParams(raw,source,size,condition); $('.market-open',panel)?.setAttribute('href',target);
    const key=`${source}|${target}|${condition}`; if(!force&&panel.dataset.loadedKey===key)return;
    const requestId=String((Number(panel.dataset.requestId)||0)+1); panel.dataset.requestId=requestId;
    status.textContent='取得中'; status.className='market-status'; empty.hidden=false; empty.textContent='価格情報を取得しています…'; svg.hidden=true; metrics.innerHTML='';
    try{
      const text=await fetchText(target,force);
      if(panel.dataset.requestId!==requestId)return;
      const data=source==='stockx'?stockxData(text,condition):snkrData(text);
      drawChart(panel,data); panel.dataset.loadedKey=key;
      status.textContent=data.points?.length>=2?'表示中':'一部取得'; status.className='market-status '+(data.points?.length>=2?'ok':'warn');
    }catch(err){
      if(panel.dataset.requestId!==requestId)return;
      status.textContent='取得不可'; status.className='market-status error'; empty.hidden=false; empty.textContent='外部ページの取得制限でチャートを読み込めませんでした。公式ページで確認してください。'; svg.hidden=true; metrics.innerHTML='';
    }
  }
  function drawChart(panel,data){const svg=$('.market-chart',panel),empty=$('.market-empty',panel),metrics=$('.market-metrics',panel);metrics.innerHTML='';(data.metrics||[]).forEach(([k,v])=>{const d=document.createElement('div');d.className='market-metric';d.innerHTML=`<span>${k}</span><strong>${v||'—'}</strong>`;metrics.appendChild(d)});const pts=(data.points||[]).filter(x=>Number.isFinite(x.value)&&x.value>0);if(pts.length<2){svg.hidden=true;empty.hidden=false;empty.textContent=data.unsupported||'価格履歴を取得できませんでした。';return;}const W=520,H=190,L=46,R=16,T=20,B=38,min=Math.min(...pts.map(x=>x.value)),max=Math.max(...pts.map(x=>x.value)),pad=Math.max((max-min)*.16,max*.05,1),lo=Math.max(0,min-pad),hi=max+pad,x=i=>L+(W-L-R)*(pts.length===1?.5:i/(pts.length-1)),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));let s='';for(let i=0;i<4;i++){const yy=T+(H-T-B)*i/3,val=hi-(hi-lo)*i/3;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e5e5e1"/><text x="${L-6}" y="${yy+3}" text-anchor="end" font-size="8" fill="#909090">${Math.round(val).toLocaleString()}</text>`;}const path=pts.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');s+=`<path d="${path}" fill="none" stroke="#111" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;pts.forEach((p,i)=>{s+=`<circle cx="${x(i)}" cy="${y(p.value)}" r="3.2" fill="#fff" stroke="#111" stroke-width="2"/><text x="${x(i)}" y="${H-16}" text-anchor="middle" font-size="8" fill="#777">${p.label}</text><text x="${x(i)}" y="${y(p.value)-8}" text-anchor="middle" font-size="8" font-weight="800">${fmt(p.value,data.currency)}</text>`});svg.innerHTML=s;svg.hidden=false;empty.hidden=true;}
})();
