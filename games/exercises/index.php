<?php
/**
 * Members-only entry point (issue #71 — Digital Experience previews + login gate).
 * Unauthenticated requests are redirected to /login.php?next=<this page> by the
 * shared coaching session gate, same as /beta/ and /members.
 *
 * Exception (issue #101 — LinkedIn taste-then-ask): anonymous visitors who
 * arrive with ?src=li skip the gate and get a short preview: the practices
 * marked "free" in data/exercises/practices.json, in full. Signed-in visitors
 * (session cookie present) always go through the gate so their session
 * revalidates, and get every practice. No session is started for the free
 * preview, so the page stays cookie-free for that traffic.
 */
$afFreePreview = (($_GET['src'] ?? '') === 'li') && empty($_COOKIE[session_name()]);
if (!$afFreePreview) {
    require dirname(__DIR__, 2) . '/includes/beta-gate.load.php';
} else {
    error_log('exercises: li-landing free preview ua=' . ($_SERVER['HTTP_USER_AGENT'] ?? '-'));
}

// Issue #114: the practice text is read here, on the server, from a directory
// the web server denies. A member passed the gate above (it redirects and exits
// otherwise), so $betaAuthed is true; the free preview never ran the gate, so
// that visitor is anonymous. Anonymous visitors get the free practices in full
// and every other practice as a title-only stub: the rest never leaves the
// server. If the gate ever stops exiting, an unauthenticated visitor still
// gets stubs, because membership needs $betaAuthed as well.
require_once dirname(__DIR__, 2) . '/includes/exercises-data.php';
$afMember = !$afFreePreview && !empty($betaAuthed);
$afExercises = af_exercises_visible(
    af_exercises_load(dirname(__DIR__, 2) . '/data/exercises/practices.json'),
    $afMember
);
$afExercisesJson = af_exercises_json($afExercises);
if ($afExercises === []) {
    http_response_code(503);
}
if ($afMember) {
    // This page differs by visitor: a shared cache must never keep the member copy.
    header('Cache-Control: private, no-store');
}

// Issue #110: short kind lines shown after a logged session. A missing or
// broken data file is logged and the page works without them.
require dirname(__DIR__, 2) . '/includes/lightness.php';
$afLightnessJson = af_lightness_json(dirname(__DIR__, 2) . '/data/exercises/lightness.json');
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Twenty Practices — AikiField Games</title>
<meta name="description" content="Twenty movement practices from the work of Richard Moon 6th Dan. Free: DBSO, Wrist Grab Grounding, Ten to the Tenth.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="/css/redesign.css?v=20261003">
<style>
:where(.game),:where(.game) *{box-sizing:border-box;margin:0;padding:0}
body{background:#FAF6EF}
.game{font-family:-apple-system,Inter,Helvetica,sans-serif;font-size:16px;color:#1A1A1A;line-height:1.65}
.game h1,.game h2,.game h3{font-family:inherit;font-weight:bold;color:inherit;letter-spacing:normal}
.game-head{padding:20px 28px;border-bottom:1px solid #E8E0D0;display:flex;justify-content:space-between;align-items:center;background:#FAF6EF}
.game h1{font-size:26px;letter-spacing:-0.02em;line-height:1.1} .game h1 span{display:block;font-weight:400;font-size:12px;opacity:0.6;margin-top:4px}
.wrap{display:grid;grid-template-columns:300px 1fr 280px;min-height:100vh}
.sidebar,.right{padding:20px;border-right:1px solid #E8E0D0;overflow-y:auto;max-height:calc(100vh - var(--site-header-h,76px));position:sticky;top:var(--site-header-h,76px)}
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
.lightness-opt{display:block;margin-top:8px;font-size:11px;opacity:0.75;cursor:pointer}
.lightness-opt input{margin-right:6px;vertical-align:middle}
.lightness{margin-top:10px;padding:10px 12px;background:#F5F0E6;border-left:3px solid #1A1A1A;font-size:13px;font-style:italic;line-height:1.5}
.lightness:empty{display:none}
@media(max-width:1050px){.wrap{grid-template-columns:1fr} .sidebar,.right{position:relative;max-height:none}}
</style></head><body>
<a href="#main" class="af-skip-link">Skip to main content</a>

<header class="af-header">
  <div class="af-header__inner">
    <a href="/index.html" class="af-brand">
      <span class="af-brand__icon" aria-hidden="true">A</span>
      <span class="af-brand__text">AikiField</span>
    </a>
    <input type="checkbox" id="af-nav-check" class="af-nav-toggle-check">
    <label for="af-nav-check" class="af-nav__toggle" aria-label="Menu">&#9776;</label>
    <nav aria-label="Primary" class="af-nav">
      <a href="/index.html" class="af-nav__link">Home</a>
      <div class="af-nav__group">
        <a href="/services.html" class="af-nav__link">Services</a>
        <button type="button" class="af-nav__sub-toggle" aria-expanded="false" aria-controls="af-nav-sub-services" aria-label="Services pages"><span aria-hidden="true">&#9662;</span></button>
        <ul class="af-nav__submenu" id="af-nav-sub-services">
          <li><a href="/process.html" class="af-nav__sublink">Process</a></li>
          <li><a href="/approach.html" class="af-nav__sublink">Approach</a></li>
          <li><a href="/case-studies.html" class="af-nav__sublink" data-i18n="nav.case_studies">Case Studies</a></li>
          <li><a href="/assessment.html" class="af-nav__sublink" data-i18n="nav.assessment">Assessment</a></li>
        </ul>
      </div>
      <a href="/projects.php" class="af-nav__link">Demonstration Technologies</a>
      <div class="af-nav__group">
        <button type="button" class="af-nav__link af-nav__menu-btn af-nav__link--active" aria-expanded="false" aria-controls="af-nav-sub-uf" aria-current="page" data-i18n="nav.unified_field_studies">Studies in the Unified Field</button>
        <ul class="af-nav__submenu af-nav__submenu--end af-nav__submenu--mega" id="af-nav-sub-uf">
          <li class="af-nav__megacol">
            <a href="/books.html" class="af-nav__colhead" data-i18n="nav.books">Books</a>
            <ul class="af-nav__megalist">
              <li><a href="/books.html" class="af-nav__sublink" data-i18n="nav.all_books">All Books</a></li>
              <li><a href="/blog/" class="af-nav__sublink" data-i18n="nav.insights_blog">Author's Insights blog</a></li>
            </ul>
          </li>
          <li class="af-nav__megacol">
            <a href="/digital-experience/" class="af-nav__colhead" data-i18n="nav.digital_experience">Digital Experience</a>
            <ul class="af-nav__megalist">
          <li><a href="/digital-experience/lucky-wave.html#v1" class="af-nav__sublink">Ride the Lucky Wave</a></li>
          <li><a href="/digital-experience/lucky-wave.html#v2" class="af-nav__sublink">Ride the Lucky Wave V2</a></li>
          <li><a href="/games/exercises/" class="af-nav__sublink">Twenty Practices</a></li>
          <li class="af-nav__subsep"><a href="/members" class="af-nav__sublink af-nav__sublink--feature">Enter the Unified Field Chat</a></li>
              <li class="af-nav__subsep"><a href="/blog/index.html#social" class="af-nav__sublink" data-i18n="nav.social_media">Social Media</a></li>
            </ul>
          </li>
        </ul>
      </div>
      <a href="/somatic-studios/" class="af-nav__link" data-i18n="nav.somatic_studios">Free Services For Studios</a>
      <a href="/contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>
<main id="main" class="game">
<div class="game-head"><h1>TWENTY PRACTICES <span>Quantum Aikido — Book of Exercises & Practices — from the work of Richard Moon 6th Dan · Student of Robert Nadeau since '71</span></h1><a href="/games/" style="padding:7px 14px;border:1px solid #1A1A1A;background:#fff;color:#1A1A1A;text-decoration:none;font-size:12px">All games</a></div>
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
</main>
<script>
// Issue #114: sent by the server (includes/exercises-data.php). A member gets every
// practice; an anonymous visitor gets the free ones in full and the rest as
// {id,title,part} stubs. The text of a locked practice never reaches this page.
const AF_MEMBER = <?= $afMember ? 'true' : 'false' ?>;
const exercises = <?= $afExercisesJson ?>;
const interludes = [{"title": "INTERLUDE \u2014 OPENING", "text": "This second has passed\nas has this one\nThe moment is so fleeting\nyet\nthe now is eternal\n\nRichard Moon"}, {"title": "INTERLUDE \u2014 AFTER PART I", "text": "Feel\ninto the center\nof your central core\neven by drops\nin ever finer adjustments\n\nRichard Moon"}, {"title": "INTERLUDE \u2014 AFTER PART II", "text": "Listen to the impulse to breathe\nfollow the guidance\nbreathe exactly\nlike you want to\n\nRichard Moon"}, {"title": "INTERLUDE \u2014 AFTER PART III", "text": "I don't really study Aikido as a Martial art,\nan art in the realm of Mars, the god of war.\nI study Aikido as a Venusial art,\nan art in the realm of Venus, the goddess of love.\n\nRichard Moon"}, {"title": "INTERLUDE \u2014 CLOSING", "text": "joy is the greatest treasure\ndon't get mad\ndon't even get even\ncreate a beautiful world\n\nRichard Moon\n\n\u201cLove gives birth to harmony, harmony brings forth joy, and joy is the greatest treasure.\u201d \u2014 Morihei Ueshiba, O-Sensei."}];
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
let currentPart='all';
// Members have every practice. Everyone else has the ones the data marks free;
// the rest arrived as stubs (id, title, part) with no text to show.
function isUnlocked(ex){ return AF_MEMBER || ex.free===true; }
// The page opens on a practice the visitor can read.
if(!exercises.some(e=>e.id===currentId&&isUnlocked(e))){
 const first=exercises.find(isUnlocked);
 if(first) currentId=first.id;
}
// KeepDoingIt progress persists in localStorage.
let completed=new Set(JSON.parse(localStorage.getItem('moon_completed')||'[1]'));
let sessionLog=JSON.parse(localStorage.getItem('moon_session_log')||'[]');
function persistProgress(){
 try{ localStorage.setItem('moon_completed', JSON.stringify(Array.from(completed)));
      localStorage.setItem('moon_session_log', JSON.stringify(sessionLog)); }catch(e){ console.error('KeepDoingIt persist failed', e); }
}
// Lightness (issue #110): one short kind line after a logged session. The lines
// come from data/lightness.json via includes/lightness.php; the player can turn
// them off and the choice is remembered. Lines are never attributed to anyone.
const LIGHTNESS=<?= $afLightnessJson ?>;
const LIGHTNESS_KEY='moon_lightness', LIGHTNESS_LAST_KEY='moon_lightness_last';
let lightnessShown=null;
function lightnessOn(){
 try{ return localStorage.getItem(LIGHTNESS_KEY)!=='0'; }
 catch(e){ console.warn('lightness setting unreadable; showing lines', e); return true; }
}
function setLightness(on){
 try{ localStorage.setItem(LIGHTNESS_KEY, on?'1':'0'); }
 catch(e){ console.error('lightness setting not saved', e); }
}
function lastLightnessId(){
 try{ return localStorage.getItem(LIGHTNESS_LAST_KEY); }
 catch(e){ console.warn('last lightness line unreadable', e); return null; }
}
function rememberLightnessId(id){
 try{ localStorage.setItem(LIGHTNESS_LAST_KEY, id); }
 catch(e){ console.warn('last lightness line not saved', e); }
}
// Lines tagged to this practice come first, then the general ones. The nth
// logged session of a practice shows the nth line, so every line gets its turn
// and none repeats back to back.
function pickLightness(pid){
 const pool=LIGHTNESS.filter(l=>l.practices.includes(pid)).concat(LIGHTNESS.filter(l=>!l.practices.length));
 if(!pool.length) return null;
 const n=sessionLog.filter(s=>s.id===pid).length;
 let i=Math.max(n-1,0)%pool.length;
 if(pool.length>1&&pool[i].id===lastLightnessId()) i=(i+1)%pool.length;
 rememberLightnessId(pool[i].id);
 return pool[i];
}
function paintLightness(){
 const el=document.getElementById('lightness'); if(!el) return;
 el.textContent=(lightnessShown&&lightnessShown.practiceId===currentId)?lightnessShown.text:'';
}
function showLightness(pid){
 if(!LIGHTNESS.length||!lightnessOn()) return;
 const line=pickLightness(pid); if(!line) return;
 lightnessShown={practiceId:pid,text:line.text};
 paintLightness();
}
function bindLightness(){
 const cb=document.getElementById('lightnessToggle'); if(!cb) return;
 cb.onchange=()=>{ setLightness(cb.checked); if(!cb.checked) lightnessShown=null; paintLightness(); };
 paintLightness();
}
function studioSlug(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function showLockedModal(ex){
 const overlay=document.createElement('div');
 overlay.id='lockModal'; overlay.className='game';
 overlay.style.cssText='position:fixed;inset:0;background:rgba(26,26,26,0.55);display:flex;align-items:center;justify-content:center;z-index:150;padding:20px';
 overlay.innerHTML=`<div style="background:#FAF6EF;border:2px solid #1A1A1A;padding:32px;max-width:420px;text-align:center">
   <div style="font-size:11px;letter-spacing:0.12em;margin-bottom:10px">LOCKED PRACTICE</div>
   <h2 style="font-size:20px;margin-bottom:10px">${ex.title}</h2>
   <p style="font-size:14px;font-style:italic">Twenty practices from the work of Richard Moon 6th Dan</p>
   <p style="font-size:12px;opacity:0.7;margin:14px 0">Free practices: DBSO, Wrist Grab Grounding, Ten to the Tenth. Unlock all 15+5 with a free AikiField account.</p>
   <a href="/login.php?next=/games/exercises/" class="btn" style="display:inline-block;margin-bottom:10px">Sign in to unlock all</a><br>
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
 list.innerHTML=filtered.map(e=>`<span class="chip ex-chip ${e.id===currentId?'active':''} ${isUnlocked(e)?'':'locked'}" data-id="${e.id}">${e.id}. ${esc(tr('ex'+e.id+'.title', e.title))} ${isUnlocked(e)?'• FREE':'🔒'}</span>`).join('');
 list.querySelectorAll('.ex-chip').forEach(el=>{
   el.onclick=()=>selectPractice(parseInt(el.dataset.id), part);
 });
}
// Open a practice. A locked one shows the sign-in modal and leaves the player
// on the practice it already shows.
function selectPractice(id, part){
 const ex=exercises.find(e=>e.id===id);
 if(!ex){ console.warn('selectPractice: no practice with id', id); return; }
 if(!isUnlocked(ex)){ showLockedModal(ex); return; }
 currentId=id; renderPlayer(); renderExList(part||currentPart);
}
function renderPlayer(){
 const ex=exercises.find(e=>e.id===currentId);
 if(!ex||!isUnlocked(ex)){
   console.error('renderPlayer: no readable practice for id', currentId);
   document.getElementById('player').textContent='The practices are unavailable right now. Please try again soon.';
   return;
 }
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
   ${LIGHTNESS.length?`<label class="lightness-opt"><input type="checkbox" id="lightnessToggle" ${lightnessOn()?'checked':''}> A little smile after logging</label><div id="lightness" class="lightness" role="status" aria-live="polite"></div>`:''}
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
 document.getElementById('keepB').onclick=()=>{completed.add(currentId); sessionLog.push({id:currentId,at:new Date().toISOString()}); persistProgress(); renderProgress(); showLightness(currentId); alert('Logged! KeepDoingIt');};
 bindLightness();
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
// Issue #114: the server decides who gets the full text (the same session gate as
// before), so a member's page already holds every practice. An anonymous preview
// page holds only the free ones; if the visitor signed in elsewhere since the
// page loaded, auth-state.php says so and the visitor reloads to get the rest.
function showAuthBadge(html){
 const b=document.getElementById('authBadge');
 b.style.display='block';
 b.innerHTML=html;
}
function checkSignedIn(){
 return fetch('auth-state.php',{credentials:'same-origin'})
  .then(r=>r.ok?r.json():Promise.reject(new Error('auth-state HTTP '+r.status)))
  .then(d=>{
    if(!d.authed) return;
    showAuthBadge('Signed in — <a href="">reload to unlock all practices</a>.');
  })
  .catch(e=>console.error('auth-state check failed',e));
}
if(AF_MEMBER) showAuthBadge('Signed in — <strong>all 20 practices unlocked</strong>.');
else checkSignedIn();
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
    try { selectPractice(slugMap[exSlug]); } catch(e){ console.error('exercise slug route', e); }
  }
  // Support path-based /games/exercises/:slug
  const pathParts = location.pathname.split('/').filter(Boolean);
  // /games/exercises/wrist-grab-grounding -> last part is slug
  if(pathParts.length>=3 && pathParts[0]==='games' && pathParts[1]==='exercises') {
    const last = pathParts[pathParts.length-1].toLowerCase();
    if(slugMap[last]) {
      try { selectPractice(slugMap[last]); } catch(e){ console.error('exercise path route', e); }
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
      items.push({id:'ex'+e.id+'.part', text:e.part});
      if(!isUnlocked(e)) return; // a stub has no meta or body to translate
      items.push({id:'ex'+e.id+'.meta', text:e.meta});
      e.body.split(/\n\n+/).forEach((p,i)=>{ if(p.trim()) items.push({id:'ex'+e.id+'.body:p'+i, text:p}); });
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

<script>
// Keep the sticky sidebars just below the site header, whatever height it wraps to.
(function(){
 var h=document.querySelector(".af-header"); if(!h) return;
 function set(){ document.documentElement.style.setProperty("--site-header-h", h.offsetHeight+"px"); }
 set(); window.addEventListener("resize", set);
 if(window.ResizeObserver) new ResizeObserver(set).observe(h);
})();
</script>
<script src="/js/nav-menu.js?v=20261002" defer></script>
</body></html>
