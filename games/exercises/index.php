<?php
/**
 * Members-only entry point (issue #71 — Digital Experience previews + login gate).
 * Unauthenticated requests are redirected to /login.php?next=<this page> by the
 * shared coaching session gate, same as /beta/ and /members.
 *
 * Exception (issue #101 — LinkedIn taste-then-ask): anonymous visitors who
 * arrive with ?src=li skip the gate and keep the three free practices the
 * page's JS already exposes to signed-out users. Signed-in visitors (session
 * cookie present) always go through the gate so their session revalidates.
 * No session is started for the free preview, so the page stays cookie-free
 * for that traffic.
 */
$afIsLi = (($_GET['src'] ?? '') === 'li');
$afFreePreview = false;
if ($afIsLi && empty($_COOKIE[session_name()])) {
    // Anonymous LinkedIn landing — cookie-free free preview, no session
    // started (issue #101 taste-then-ask).
    $afFreePreview = true;
    error_log('exercises: li-landing free preview ua=' . ($_SERVER['HTTP_USER_AGENT'] ?? '-'));
} elseif ($afIsLi) {
    // A session cookie exists (the visitor may have touched login.php once).
    // Decide the preview by the auth-state result, not by cookie presence
    // (issue #121): signed-in members get the full set through the normal
    // gate path, everyone else still gets the free preview instead of a
    // redirect that strands the LinkedIn funnel.
    define('AF_GATE_NO_REDIRECT', true);
    require dirname(__DIR__, 2) . '/includes/beta-gate.load.php';
    $afFreePreview = !$betaAuthed;
} else {
    // Non-LinkedIn traffic: unauthenticated visitors go to login as before.
    require dirname(__DIR__, 2) . '/includes/beta-gate.load.php';
}

// Issue #114: the practice text is members-only and must not ship to
// anonymous browsers. Load the single canonical copy server-side
// (data/.htaccess denies direct fetches). Anonymous ?src=li visitors get
// only the three free practices in full — the other twelve are emitted as
// title-only stubs, so view-source can no longer read the book. Signed-in
// members get all 15.
$afPracticesRaw = file_get_contents(__DIR__ . '/data/practices.json');
$afPractices = $afPracticesRaw === false ? null : json_decode($afPracticesRaw, true);
if (!is_array($afPractices) || empty($afPractices['exercises'])) {
    error_log('exercises: data/practices.json missing or unreadable — cannot render');
    http_response_code(500);
    echo 'Practice data unavailable.';
    exit;
}
$afExercises  = $afPractices['exercises'];
$afInterludes = $afPractices['interludes'] ?? [];
if ($afFreePreview) {
    $afFreeIds = [1, 6, 12]; // keep in sync with FREE_IDS in the script below
    $afExercises = array_map(static function (array $ex) use ($afFreeIds): array {
        if (in_array((int) ($ex['id'] ?? 0), $afFreeIds, true)) {
            return $ex;
        }
        return [
            'id'     => $ex['id'],
            'title'  => $ex['title'],
            'part'   => $ex['part'],
            'locked' => true,
        ];
    }, $afExercises);
}
$afJsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG;
?>
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Twenty Practices — AikiField Games</title>
<meta name="description" content="Twenty movement practices from the work of Richard Moon 6th Dan. Free: DBSO, Wrist Grab Grounding, Ten to the Tenth.">
<style>
*{box-sizing:border-box;margin:0;padding:0} body{font-family:-apple-system,Inter,Helvetica,sans-serif;background:#FAF6EF;color:#1A1A1A;line-height:1.65}
header{padding:20px 28px;border-bottom:1px solid #E8E0D0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#FAF6EF;z-index:10}
h1{font-size:26px;letter-spacing:-0.02em;line-height:1.1} h1 span{display:block;font-weight:400;font-size:12px;opacity:0.6;margin-top:4px}
.wrap{display:grid;grid-template-columns:300px 1fr 280px;min-height:100vh}
.sidebar,.right{padding:20px;border-right:1px solid #E8E0D0;overflow-y:auto;max-height:calc(100vh - 70px);position:sticky;top:70px}
.right{border-right:none;border-left:1px solid #E8E0D0}
.center{padding:28px;max-width:820px}
.studio{padding:10px 12px;margin:6px 0;border:1px solid #E8E0D0;background:#fff;cursor:pointer;font-size:12px}
.studio.active{background:#1A1A1A;color:#fff}
.chip{display:inline-block;padding:6px 10px;border:1px solid #1A1A1A;font-size:11px;cursor:pointer;background:#fff;margin:4px}
.chip.active{background:#1A1A1A;color:#fff} .chip.locked{opacity:0.35}
.player{background:#fff;border:1.5px solid #1A1A1A;padding:26px;margin-top:18px}
.meta{font-style:italic;opacity:0.6;font-size:12px;margin:6px 0 14px}
.body{white-space:pre-wrap;font-size:14.5px;line-height:1.75}
.poem{text-align:center;padding:32px;font-style:italic;white-space:pre-wrap;line-height:2;background:#F5F0E6;margin:22px 0;border:1px solid #E8E0D0}
.timer{margin:18px 0;padding:18px;background:#FAF6EF;border:1px dashed #1A1A1A;text-align:center}
.circle{width:110px;height:110px;border-radius:50%;border:3px solid #1A1A1A;margin:10px auto;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
.btn{padding:11px 18px;background:#1A1A1A;color:#fff;border:none;cursor:pointer;width:100%;margin-top:12px;font-weight:700}
.toggle{display:flex;gap:6px;margin:10px 0} .toggle button{flex:1;padding:7px;border:1px solid #1A1A1A;background:#fff;cursor:pointer;font-size:12px} .toggle button.active{background:#1A1A1A;color:#fff}
.ground{height:8px;background:#E8E0D0;margin:10px 0} .ground-fill{height:100%;background:#1A1A1A;transition:width .5s}
img.hero{width:100%;max-width:300px;display:block;margin:10px auto;border:1px solid #E8E0D0}
.deploy{font-size:11px;background:#fff;border:1px solid #E8E0D0;padding:14px}
@media(max-width:1050px){.wrap{grid-template-columns:1fr} .sidebar,.right{position:relative;max-height:none}}
</style></head><body>
<header><h1>TWENTY PRACTICES <span>The Creative Unified Field — Book of Exercises & Practices — from the work of Richard Moon 6th Dan · Student of Robert Nadeau since '71</span></h1><a href="/games/" style="padding:7px 14px;border:1px solid #1A1A1A;background:#fff;color:#1A1A1A;text-decoration:none;font-size:12px">All games</a></header>
<div class="wrap">
<div class="sidebar">
<h3 style="font-size:11px;letter-spacing:0.12em">60 STUDIOS · PERSONALIZATION</h3>
<input id="search" placeholder="Search studios..." style="width:100%;padding:8px;border:1px solid #1A1A1A;margin:10px 0">
<div id="studioList"></div>
<img class="hero" src="images/image_20260919_144743.webp">
<img class="hero" src="images/image_20260919_144742.webp">
<img class="hero" src="images/image_20260919_144741.webp">
<p style="font-size:10px;opacity:0.5;margin-top:6px">Simple image copy: ≤7 words, black on washi, sub "By Richard Moon 6th Dan"</p>
</div>
<div class="center">
<div id="banner" style="display:none;padding:12px;background:#1A1A1A;color:#fff;font-size:12px;margin-bottom:14px"></div>
<div id="authBadge" style="display:none;padding:8px 12px;background:#F5F0E6;border:1px solid #E8E0D0;font-size:12px;margin-bottom:10px"></div>
<div style="font-size:11px;letter-spacing:0.1em">PART NAVIGATION — AUTO-LOADED FROM MARKDOWN</div>
<div id="partTabs"></div>
<div style="font-size:11px;letter-spacing:0.1em;margin-top:14px">EXERCISES — 15 FROM YOUR PDF</div>
<div id="exList"></div>
<div class="player" id="player"></div>
</div>
<div class="right">
<h3 style="font-size:11px;letter-spacing:0.1em">FREEMIUM MODEL</h3>
<div style="border:1px solid #1A1A1A;padding:10px;margin:8px 0;background:#fff"><strong>FREE</strong> — DBSO, Wrist Grab, Ten to the Tenth<br><span style="font-size:10px">3 practices always free + log + reminder</span></div>
<div style="border:2px solid #1A1A1A;padding:10px;margin:8px 0;background:#1A1A1A;color:#fff"><strong>CREATOR $12/mo $96/yr</strong><br><span style="font-size:10px">All 15+5 exclusive, 21-day Challenge, offline audio, progress</span></div>
<div style="border:1px solid #1A1A1A;padding:10px;margin:8px 0"><strong>DOJO $49/mo</strong><br><span style="font-size:10px">White-label for 60 studios, 30% rev share, analytics, student invites via 180 CTAs</span></div>
<div id="progress"></div>
<div class="deploy">
<b>AikiField deep links</b><br>
Query: /games/exercises/?studio_id=city-aikido&amp;exercise=wrist-grab-grounding<br>
Path: /games/exercises/wrist-grab-grounding?studio_id=city-aikido<br>
studio_id personalizes the banner; exercise auto-opens the practice.
</div>
</div>
</div>
<script>
const exercises = <?= json_encode($afExercises, $afJsonFlags) ?>;
const interludes = <?= json_encode($afInterludes, $afJsonFlags) ?>;
const studios = [
{name:"City Aikido", region:"SF Bay", cat:"Aikido dojo", about:"Home dojo of Robert Nadeau Shihan, Richard Moon's teacher since 1971. Friends of City Aikido and O-Sensei's teachings."},
{name:"Aikido San Francisco", region:"SF Bay", cat:"Aikido dojo", about:"Opened 1986 in SOMA, positive supportive environment."},
{name:"Aikido of Berkeley", region:"East Bay", cat:"Aikido dojo", about:"1514 University Ave, progressive dojo, Free Aiki Dojo, peace practices."},
{name:"Aikido Institute", region:"East Bay", cat:"Aikido dojo", about:"California non-profit Emeryville, Takemusu Aikido Association."},
{name:"Alameda Aikikai", region:"East Bay", cat:"Aikido dojo", about:"Non-profit 501c3 established 1991 Alameda, family-friendly."},
{name:"Aikido Of Montclair Village", region:"East Bay", cat:"Aikido dojo", about:"Essential teachings of Morihei Ueshiba as taught by Saito Shihan."},
{name:"The Omni Movement", region:"East Bay", cat:"Dance", about:"Growing social dance as healthy accessible expression, Brazilian Zouk."},
{name:"In the Groove Studios", region:"East Bay", cat:"Dance", about:"Sanctuary to become person you aspire to be."},
{name:"Atomic Allure", region:"East Bay", cat:"Pole/Aerial", about:"Beauty stems from within, body-positive pole and aerial."},
{name:"Shawl-Anderson Dance Center", region:"East Bay", cat:"Dance school", about:"Premier non-profit dance education Berkeley since 1958."},
{name:"Movement For Everyone", region:"SF Bay", cat:"Pilates", about:"Body neutral movement studio using Pilates and GYROTONIC."},
{name:"The City Waves 5Rhythms SF", region:"SF Bay", cat:"Movement", about:"Gabrielle Roth's 5Rhythms dynamic dance & movement meditation."},
{name:"Wellington Dance Academy", region:"Wellington NZ", cat:"Dance school", about:"Community dance school 182 Thorndon Quay."},
{name:"WIDance Inclusive", region:"Wellington NZ", cat:"Dance", about:"Inclusive dance Saturday classes open to all abilities."},
{name:"The Pilates Studio Wellington", region:"Wellington NZ", cat:"Pilates", about:"Fully equipped pilates studio 107 Customhouse Quay."},
{name:"NowYoga / Yogallery", region:"Wellington NZ", cat:"Yoga", about:"Yoga studio blending yoga and art."},
{name:"Empire Aerial Arts", region:"Wellington NZ", cat:"Aerial", about:"Open timetable without term-based courses."},
{name:"Body Electric Pole", region:"Wellington NZ", cat:"Pole", about:"Beautiful art of pole dancing."},
{name:"Aikido Shinryukan Burnside", region:"Christchurch NZ", cat:"Aikido", about:"South Island's largest Aikido club."},
{name:"Movement Studio Rolleston", region:"Canterbury NZ", cat:"Pilates", about:"Movement is Medicine, remedial massage reformer pilates."}
];
let currentId = 6;
let groundPercent=50, timeLeft=300, isPlaying=false, timer=null;
const FREE_IDS=[1,6,12];
let freeIds=new Set(FREE_IDS);
let currentPart='all';
// KeepDoingIt progress persists in localStorage.
let completed=new Set(JSON.parse(localStorage.getItem('moon_completed')||'[1]'));
let sessionLog=JSON.parse(localStorage.getItem('moon_session_log')||'[]');
function persistProgress(){
 try{ localStorage.setItem('moon_completed', JSON.stringify(Array.from(completed)));
      localStorage.setItem('moon_session_log', JSON.stringify(sessionLog)); }catch(e){ console.error('KeepDoingIt persist failed', e); }
}
function studioSlug(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function showLockedModal(ex){
 const overlay=document.createElement('div');
 overlay.id='lockModal';
 overlay.style.cssText='position:fixed;inset:0;background:rgba(26,26,26,0.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px';
 overlay.innerHTML=`<div style="background:#FAF6EF;border:2px solid #1A1A1A;padding:32px;max-width:420px;text-align:center">
   <div style="font-size:11px;letter-spacing:0.12em;margin-bottom:10px">LOCKED PRACTICE</div>
   <h2 style="font-size:20px;margin-bottom:10px">${ex.title}</h2>
   <p style="font-size:14px;font-style:italic">Twenty practices from the work of Richard Moon 6th Dan</p>
   <p style="font-size:12px;opacity:0.7;margin:14px 0">Free practices: DBSO, Wrist Grab Grounding, Ten to the Tenth. Unlock all 15+5 with a free AikiField account.</p>
   <a href="/login.php?src=li&next=/games/exercises/" class="btn" style="display:inline-block;margin-bottom:10px">Sign in to unlock all</a><br>
   <button class="btn" id="lockClose">Back to free practices</button>
 </div>`;
 document.body.appendChild(overlay);
 const close=()=>{ overlay.remove(); };
 overlay.onclick=(e)=>{ if(e.target===overlay) close(); };
 document.getElementById('lockClose').onclick=close;
}
function renderStudios(f=""){
 const list=document.getElementById('studioList');
 list.innerHTML=studios.filter(s=>s.name.toLowerCase().includes(f.toLowerCase())).map(s=>`<div class="studio" data-n="${s.name}"><strong>${s.name}</strong><br><span style="font-size:10px;opacity:0.7">${s.region} · ${s.cat}</span></div>`).join('');
 list.querySelectorAll('.studio').forEach(el=>{
   el.onclick=()=>{
     document.querySelectorAll('.studio').forEach(x=>x.classList.remove('active')); el.classList.add('active');
     const st=studios.find(x=>x.name===el.dataset.n);
     showStudioBanner(st);
   }
 });
}
function showStudioBanner(st){
 const b=document.getElementById('banner'); b.style.display='block';
 b.innerHTML=`Practicing for <strong>${st.name}</strong> students — ${st.about} — Twenty practices from the work of Richard Moon to improve physical performance + creativity.`;
}
function selectStudioBySlug(slug){
 const st=studios.find(x=>studioSlug(x.name)===slug.toLowerCase());
 if(st) showStudioBanner(st);
}
// Translations arrive as {itemId: translatedText}; tr() returns the
// translation when one is cached, else the English source (issue #894).
const TR={}; let ANNOT=null;
function tr(id, src){ return TR[id] || src; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderPartTabs(){
 const tabs=document.getElementById('partTabs');
 const parts=[["all","All 15"], ["Part I","Part I · centering (6)"], ["Part II","Part II · breath (5)"], ["Part III","Part III · attention (3)"], ["Part IV","Part IV · dialogue (1)"]];
 tabs.innerHTML=parts.map(p=>`<span class="chip ${p[0]==='all'?'active':''}" data-part="${p[0]}">${esc(tr('part.'+p[0], p[1]))}</span>`).join('');
 tabs.querySelectorAll('.chip').forEach(el=>{
   el.onclick=()=>{ tabs.querySelectorAll('.chip').forEach(x=>x.classList.remove('active')); el.classList.add('active'); currentPart=el.dataset.part; renderExList(currentPart); }
 });
}
function renderExList(part="all"){
 const list=document.getElementById('exList');
 let filtered=exercises;
 if(part!=="all") filtered=exercises.filter(e=>e.part.includes(part));
 list.innerHTML=filtered.map(e=>`<span class="chip ex-chip ${e.id===currentId?'active':''} ${freeIds.has(e.id)?'':'locked'}" data-id="${e.id}">${e.id}. ${esc(tr('ex'+e.id+'.title', e.title))} ${freeIds.has(e.id)?'• FREE':'🔒'}</span>`).join('');
 list.querySelectorAll('.ex-chip').forEach(el=>{
   el.onclick=()=>{
     const ex=exercises.find(e=>e.id===parseInt(el.dataset.id));
     if(!freeIds.has(ex.id)){ showLockedModal(ex); return; }
     currentId=parseInt(el.dataset.id); renderPlayer(); renderExList(part);
   }
 });
}
function renderPlayer(){
 const ex=exercises.find(e=>e.id===currentId);
 if(!freeIds.has(ex.id)){ showLockedModal(ex); return; }
 const isWrist=ex.title.includes('Wrist Grab');
 const interMap={'Part I — centering & grounding':interludes[1],'Part II — breath & energy':interludes[2],'Part III — attention & feeling':interludes[3],'Part IV — dialogue & relationship':interludes[4]};
 const inter=interMap[ex.part]||null;
 const bodyText=tr('ex'+ex.id+'.body', ex.body);
 const bodyParas=bodyText.split(/\n\n+/).map((p,i)=>`<div class="tp" data-p="p${i}">${esc(p).replace(/\n/g,'<br>')}</div>`).join('');
 document.getElementById('player').innerHTML=`
   <div style="display:flex;justify-content:space-between"><div><h2 style="font-size:22px">${esc(tr('ex'+ex.id+'.title', ex.title))}</h2><div class="meta">${esc(tr('ex'+ex.id+'.meta', ex.meta))} · ${esc(tr('ex'+ex.id+'.part', ex.part))}</div></div><span style="font-size:10px;border:1px solid #000;padding:3px 7px">Complexity ${ex.complexity}</span></div>
   ${isWrist?`<div class="toggle"><button id="realB">Real Partner</button><button id="invB" class="active" title="Invisible partner means practicing by yourself." aria-describedby="invB-desc">Invisible Partner</button><span id="invB-desc" hidden>Invisible partner means practicing by yourself.</span></div>`:''}
   <div class="body">${bodyParas}</div>
   <div class="timer"><div id="phase">Phase: 50/50 — Resist less, ground more</div><div class="circle" id="circ">${Math.floor(timeLeft/60)}:${String(timeLeft%60).padStart(2,'0')}</div><div id="prompt" style="font-size:11px">${isWrist?'Push... feel where you are':'Breathe...'}</div>${isWrist?`<div class="ground"><div class="ground-fill" id="gfill" style="width:${groundPercent}%"></div></div><div style="font-size:10px">${groundPercent}% ground — goal 60% — DBSO</div>`:''}
   <div style="display:flex;gap:6px;margin-top:10px"><button class="btn" id="playB" style="flex:1">${isPlaying?'Pause':'Play Guided'}</button><button class="btn" id="resetB" style="flex:0.3;background:#fff;color:#000;border:1px solid #000">Reset</button></div></div>
   <button class="btn" id="keepB">KeepDoingIt — Log Session</button>
   <div id="pdots" style="margin-top:10px;font-size:10px"></div>
   ${inter?`<div class="poem"><b>${esc(tr('int'+interludes.indexOf(inter)+'.title', inter.title))}</b>

${esc(tr('int'+interludes.indexOf(inter)+'.text', inter.text))}</div>`:''}
 `;
 if(ANNOT){
   const srcParas=ex.body.split(/\n\n+/);
   document.querySelectorAll('#player .tp').forEach((el,i)=>ANNOT(el,'ex'+ex.id+'.body:p'+i, srcParas[i]||'', el.textContent));
   const poem=document.querySelector('#player .poem');
   if(poem&&inter) ANNOT(poem,'int'+interludes.indexOf(inter)+'.text',inter.text,poem.textContent);
 }
 document.getElementById('playB').onclick=togglePlay;
 document.getElementById('resetB').onclick=reset;
 document.getElementById('keepB').onclick=()=>{completed.add(currentId); sessionLog.push({id:currentId,at:new Date().toISOString()}); persistProgress(); renderProgress(); alert('Logged! KeepDoingIt');};
 if(isWrist){
   document.getElementById('realB').onclick=(e)=>{e.target.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); e.target.classList.add('active')};
   document.getElementById('invB').onclick=(e)=>{e.target.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); e.target.classList.add('active')};
 }
 renderProgress();
}
function renderProgress(){
 const el=document.getElementById('progress'); if(!el) return;
 const dots=exercises.map(e=>completed.has(e.id)?'●':'○').join(' ');
 el.innerHTML=`<div style="font-size:10px">Progress: ${completed.size}/${exercises.length}<br>${dots}</div>`;
 const pd=document.getElementById('pdots'); if(pd) pd.innerHTML=`Completed IDs: ${Array.from(completed).join(', ')}`;
}
function togglePlay(){
 isPlaying=!isPlaying;
 document.getElementById('playB').textContent=isPlaying?'Pause':'Play Guided';
 if(isPlaying){
   timer=setInterval(()=>{
     timeLeft--; const c=document.getElementById('circ'); if(c) c.textContent=`${Math.floor(timeLeft/60)}:${String(timeLeft%60).padStart(2,'0')}`;
     if(timeLeft%15===0){
       const prompt=document.getElementById('prompt'), phase=document.getElementById('phase'), fill=document.getElementById('gfill');
       if(timeLeft>180){ if(prompt) prompt.textContent=timeLeft%30===0?'Push — resisting lets them pull you easily — relax & feel where you are':'Pull — resisting lets them push — relax & feel where you are'; if(phase) phase.textContent='50/50 — Resist less, ground more'; groundPercent=50; }
       else if(timeLeft>60){ if(prompt) prompt.textContent='Resistance hard to see from outside but you feel it inside'; if(phase) phase.textContent='Inside feel'; groundPercent=55; }
       else{ if(prompt) prompt.textContent='DBSO — 60% ground — KeepDoingIt'; if(phase) phase.textContent='60% ground'; groundPercent=60; }
       if(fill) fill.style.width=groundPercent+'%';
     }
     if(timeLeft<=0){ clearInterval(timer); isPlaying=false; timeLeft=300; alert(interludes[1].text); renderPlayer(); }
   },1000);
 } else { clearInterval(timer); }
}
function reset(){ clearInterval(timer); isPlaying=false; timeLeft=300; groundPercent=50; renderPlayer(); }
document.getElementById('search').oninput=(e)=>renderStudios(e.target.value);
renderStudios(); renderPartTabs(); renderExList(); renderPlayer(); renderProgress();
// Signed-in members get every practice free — check the shared site session.
fetch('auth-state.php',{credentials:'same-origin'})
 .then(r=>r.ok?r.json():Promise.reject(new Error('auth-state HTTP '+r.status)))
 .then(d=>{
   if(!d.authed) return;
   // Free-preview render only carries bodies for the three free practices
   // (issue #114) — a session created after this page loaded can't unlock
   // text that was never sent. Reload so PHP re-renders the full member set.
   if(exercises.some(e=>e.body===undefined)){ location.reload(); return; }
   freeIds=new Set(exercises.map(e=>e.id));
   document.getElementById('lockModal')?.remove();
   const b=document.getElementById('authBadge');
   b.style.display='block';
   b.innerHTML='Signed in — <strong>all 20 practices unlocked</strong>.';
   renderExList(currentPart); renderPlayer();
 })
 .catch(e=>console.error('auth-state check failed',e));
</script>

<script>
// Aikifield slug router extension
(function(){
  const slugMap = {
    'wrist-grab-grounding': 6,
    'dropsinkopen': 1, 'dropbacksinkopen': 1, 'dbso': 1,
    'listen-to-the-impulse-to-breathe': 2,
    'feel-locate-align-unify': 3, 'kamae': 3,
    'tense-release-body-scan': 4,
    'center-of-the-central-core': 5,
    'breathe-universal-harmony': 7,
    'breathing-the-whole-system': 8, 'five-stage-breath': 8,
    'o2-continuum': 9,
    'ocean-breathing': 10,
    'infant-breathing': 11,
    'ten-to-the-tenth': 12,
    'enjoy-joy-appreciate': 13,
    'shoulder-slap': 14,
    'application-visualization': 15
  };
  const params = new URLSearchParams(location.search);
  const studioParam = params.get('studio_id');
  if(studioParam) { try { selectStudioBySlug(studioParam); } catch(e){ console.error('studio banner', e); } }
  const exSlug = (params.get('exercise')||'').toLowerCase();
  if(slugMap[exSlug]) {
    try { currentId = slugMap[exSlug]; if(typeof renderPlayer==='function') renderPlayer(); } catch(e){ console.error('exercise slug route', e); }
  }
  // Support path-based /games/exercises/:slug
  const pathParts = location.pathname.split('/').filter(Boolean);
  // /games/exercises/wrist-grab-grounding -> last part is slug
  if(pathParts.length>=3 && pathParts[0]==='games' && pathParts[1]==='exercises') {
    const last = pathParts[pathParts.length-1].toLowerCase();
    if(slugMap[last]) {
      try { currentId = slugMap[last]; if(typeof renderPlayer==='function') renderPlayer(); } catch(e){ console.error('exercise path route', e); }
    }
  }
})();
</script>

<script>
// Game-translation registry for games/translate.js (issue #894).
window.AF_GAME = {
  id: 'exercises',
  collect() {
    const items=[];
    exercises.forEach(e=>{
      items.push({id:'ex'+e.id+'.title', text:e.title});
      if(e.meta!==undefined) items.push({id:'ex'+e.id+'.meta', text:e.meta});
      items.push({id:'ex'+e.id+'.part', text:e.part});
      // Free-preview stubs carry no body (issue #114).
      String(e.body||'').split(/\n\n+/).forEach((p,i)=>{ if(p.trim()) items.push({id:'ex'+e.id+'.body:p'+i, text:p}); });
    });
    interludes.forEach((it,i)=>{
      items.push({id:'int'+i+'.title', text:it.title});
      items.push({id:'int'+i+'.text', text:it.text});
    });
    [["all","All 15"],["Part I","Part I · centering (6)"],["Part II","Part II · breath (5)"],["Part III","Part III · attention (3)"],["Part IV","Part IV · dialogue (1)"]]
      .forEach(p=>items.push({id:'part.'+p[0], text:p[1]}));
    return items;
  },
  apply(map, annotate) {
    Object.assign(TR, map);
    // Per-paragraph ids (ex1.body:p0) roll up to the whole body for tr().
    exercises.forEach(e=>{
      const paras=[];
      for(let i=0; map['ex'+e.id+'.body:p'+i]!==undefined; i++) paras.push(map['ex'+e.id+'.body:p'+i]);
      if(paras.length) TR['ex'+e.id+'.body']=paras.join('\n\n');
    });
    ANNOT=(el,itemId,src,trans)=>annotate(el,itemId,src,trans);
    renderPartTabs(); renderExList(currentPart); renderPlayer();
  },
};
</script>
<script src="../translate.js"></script>

</body></html>
