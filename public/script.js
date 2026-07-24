// script.js — Songo Premium Edition
// Game logic + UX orchestration (rules unchanged)
// IFOU FOPA ANGE MIGUEL
'use strict';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS & STATE
   ══════════════════════════════════════════════════════════════ */
const P1S=6, P2S=13;
const P1=[0,1,2,3,4,5];
const P2=[7,8,9,10,11,12];
const C1='#E8C84A';   // gold  seeds (P1)
const C2='#6AA8E8';   // sapphire seeds (P2)
const CG='#60D880';   // emerald (capture)

let B=[], turn=1, over=false, busy=false, diff=1, actx;
let mode='ai', myPlayer=1, socket=null, roomCode=null;
let pendingState=null, lastMoveSeq=-1;
let gamePaused=false, pauseTimer=null;

// UX state
let _undoStack   = [];   // { B, turn } snapshots for offline undo
let _pingTimer   = null;
let _pingVal     = null;
let _notifEnabled = localStorage.getItem('songo_notif') !== 'false';
let _vibrateEnabled = localStorage.getItem('songo_vibrate') !== 'false';
window._vibrateEnabled = _vibrateEnabled;
let _animSpeed   = localStorage.getItem('songo_anim') || 'normal';
let _drawPending = false;

// Speed multiplier for animations
const SPEED_MAP = { fast: 0.55, normal: 1.0, slow: 1.7 };
function spd() { return SPEED_MAP[_animSpeed] || 1.0; }

/* ══════════════════════════════════════════════════════════════
   GAME LOGIC HELPERS  (unchanged from original)
   ══════════════════════════════════════════════════════════════ */
function init() { B=Array(14).fill(4); B[P1S]=0; B[P2S]=0; }
function opp(i) { return 12-i; }
function nx(i,p){ let n=(i+1)%14; if(p===1&&n===P2S)n=0; if(p===2&&n===P1S)n=7; return n; }
function own(i,p){ return p===1?P1.includes(i):P2.includes(i); }
function gs(p)   { return p===1?P1S:P2S; }
function wt(ms)  { return new Promise(r=>setTimeout(r,ms)); }
function flipped(){ return mode==='online'&&myPlayer===2; }

/* ══════════════════════════════════════════════════════════════
   BOARD MAPPING → DOM
   ══════════════════════════════════════════════════════════════ */
function gEl(idx){
  if(flipped()){
    if(idx===P2S)return document.getElementById('styo');
    if(idx===P1S)return document.getElementById('stai');
    if(idx>=7&&idx<=12)return document.getElementById('ryo').children[idx-7];
    if(idx>=0&&idx<=5) return document.getElementById('rai').children[5-idx];
    return null;
  }
  if(idx===P1S)return document.getElementById('styo');
  if(idx===P2S)return document.getElementById('stai');
  if(idx>=0&&idx<=5) return document.getElementById('ryo').children[idx];
  if(idx>=7&&idx<=12)return document.getElementById('rai').children[12-idx];
  return null;
}

function gCtr(idx){
  const el=gEl(idx); if(!el)return null;
  const wr=document.getElementById('bwrap').getBoundingClientRect();
  const er=el.getBoundingClientRect();
  return { x: er.left-wr.left+er.width/2, y: er.top-wr.top+er.height/2 };
}

/* ── Seed visual ─────────────────────────────────────────────── */
function mkD(n,col){
  if(n===0)return'<span class="pval z">0</span>';
  if(n>13) return'<span class="pval">'+n+'</span>';
  const cols=n===1?1:n<=4?2:3, sm=n>9?' sm':'';
  let h='<div class="dg" style="grid-template-columns:repeat('+cols+',var(--seed-sz))">';
  for(let i=0;i<n;i++) h+='<div class="d'+sm+'" style="background:'+col+'"></div>';
  return h+'</div>';
}

/* ── Pit color ───────────────────────────────────────────────── */
function pitCol(idx){
  return flipped()?(P2.includes(idx)?C2:C1):(idx<=5?C1:C2);
}

/* ── Update single pit (DOM diff) ───────────────────────────── */
function uc(idx){
  if(idx===P1S||idx===P2S){
    const mine=flipped()?P2S:P1S, oIdx=flipped()?P1S:P2S;
    const syEl=document.getElementById('svyo');
    const saEl=document.getElementById('svai');
    const scY =document.getElementById('scyo');
    const scA =document.getElementById('scai');
    if(syEl) syEl.textContent = B[mine];
    if(saEl) saEl.textContent = B[oIdx];
    if(scY)  { scY.textContent=B[mine]; Animations.bumpScore('scyo'); }
    if(scA)  { scA.textContent=B[oIdx]; Animations.bumpScore('scai'); }
    return;
  }
  const el=gEl(idx);
  if(el&&el.classList.contains('pit')){
    const c=pitCol(idx);
    const showLbl=(mode!=='ai')&&((flipped()&&P2.includes(idx))||(!flipped()&&idx<=5));
    const lbl=showLbl?'<span class="plb">'+(P2.includes(idx)?idx-6:idx+1)+'</span>':'';
    el.innerHTML=mkD(B[idx],c)+lbl;
  }
}

/* ── Animation utility ───────────────────────────────────────── */
function ta(el,cls){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend',()=>el.classList.remove(cls),{once:true});
}

function fl(el,txt,col){ Animations.floatLabel(el,txt,col); }

async function fly(fi,ti,col){
  const f=gCtr(fi), t=gCtr(ti);
  if(!f||!t)return;
  await Animations.seedFly(f,t,col);
}

/* ── Hover path preview ──────────────────────────────────────── */
function getPath(pi,p){ let s=B[pi],c=pi; const path={}; while(s--){c=nx(c,p);path[c]=(path[c]||0)+1;} return path; }
function shPath(pi,p){
  clrH(); if(pi===null||!B[pi])return;
  const path=getPath(pi,p), keys=Object.keys(path).map(Number), last=keys[keys.length-1];
  const isP2=p===2;
  keys.forEach(k=>{const el=gEl(k);if(el&&el.classList.contains('pit'))el.classList.add(k===last?(isP2?'hl2':'hl'):(isP2?'hp2':'hp'));});
}
function clrH(){document.querySelectorAll('.hp,.hl,.hp2,.hl2').forEach(e=>e.classList.remove('hp','hl','hp2','hl2'));}

/* ══════════════════════════════════════════════════════════════
   SOUND SHORTCUTS
   ══════════════════════════════════════════════════════════════ */
function snd(t){ if(window.SoundEngine) SoundEngine.play(t); }

/* ══════════════════════════════════════════════════════════════
   AI ENGINE  (unchanged)
   ══════════════════════════════════════════════════════════════ */
function apM(b,pi,p){ let s=b[pi]; if(!s)return{ok:false}; b[pi]=0; let c=pi; while(s--){c=nx(c,p);b[c]++;} const ex=c===gs(p); if(!ex&&own(c,p)&&b[c]===1){const o=opp(c);if(b[o]>0){b[gs(p)]+=b[o]+1;b[c]=0;b[o]=0;}} return{ok:true,ex}; }
function scB(b){ return b[P2S]-b[P1S]+P2.reduce((a,i)=>a+b[i]*0.08,0); }
function aiEz(){ const m=P2.filter(i=>B[i]>0); return m.length?m[Math.floor(Math.random()*m.length)]:null; }
function aiMd(){ const mv=P2.filter(i=>B[i]>0); if(!mv.length)return null; let best=null,bs=-Infinity; mv.forEach(m=>{let t=[...B];const r=apM(t,m,2);let s=scB(t);if(r.ex)s+=6;if(s>bs){bs=s;best=m;}}); return best; }
function aiHd(){ const mv=P2.filter(i=>B[i]>0); if(!mv.length)return null; let best=null,bs=-Infinity; mv.forEach(m=>{let t=[...B];const r=apM(t,m,2);let s=scB(t); if(r.ex){const m2=P2.filter(i=>t[i]>0);if(m2.length){let b2=-Infinity;m2.forEach(mm=>{let t2=[...t];apM(t2,mm,2);b2=Math.max(b2,scB(t2));});s+=b2*0.55;}} else{const om=P1.filter(i=>t[i]>0);if(om.length){let w=Infinity;om.forEach(mm=>{let t2=[...t];apM(t2,mm,1);w=Math.min(w,scB(t2));});s=s*0.5+w*0.5;}} if(s>bs){bs=s;best=m;}}); return best; }
function aip(){ return diff===1?aiEz():diff===2?aiMd():aiHd(); }

/* ══════════════════════════════════════════════════════════════
   GAME STATE HELPERS
   ══════════════════════════════════════════════════════════════ */
function pName(p){ if(mode==='ai')return p===1?'Vous':'Ordinateur'; if(mode==='local')return'Joueur '+p; return p===myPlayer?'Vous':'Adversaire'; }
function canPlay(p){ if(over||busy||gamePaused)return false; if(mode==='ai')return p===1&&turn===1; if(mode==='local')return turn===p; if(mode==='online')return turn===p&&p===myPlayer; return false; }

/* ══════════════════════════════════════════════════════════════
   SOWING ANIMATION  (offline / AI / local)
   ══════════════════════════════════════════════════════════════ */
async function animM(pi, p, opts){
  const skipBusy = opts&&opts.skipBusy;
  const seeds    = opts&&opts.seeds!==undefined ? opts.seeds : B[pi];
  if(!seeds){ if(!skipBusy)busy=false; return{ex:false,cap:false}; }
  if(!skipBusy)busy=true;

  const baseSpd = seeds<=6?215:seeds<=12?170:seeds<=20?130:90;
  const s       = Math.round(baseSpd * spd());
  const col     = p===1?C1:C2;
  const rc      = p===1?'ar':'ara';

  setInf('<span class="sd" style="background:'+col+'"></span> <b>'+seeds+'</b> graine'+(seeds>1?'s':'')+'…');

  const se=gEl(pi);
  if(se)se.classList.add(p===1?'sp':'sa');
  ta(se,'adp'); B[pi]=0; uc(pi); snd('move'); await wt(Math.round(s*0.6));
  if(se)se.classList.remove('sp','sa');

  let cur=pi;
  for(let i=0;i<seeds;i++){
    const prev=cur; cur=nx(cur,p); B[cur]++;
    fly(prev,cur,col); await wt(Math.round(s*0.42));
    const el=gEl(cur); ta(el,rc); fl(el,'+1',col);
    if(i%Math.max(1,Math.floor(seeds/8))===0) snd('move');
    uc(cur); await wt(Math.round(s*0.58));
  }

  const ex=cur===gs(p); let cap=false;
  if(ex){
    const se2=gEl(gs(p)); ta(se2,p===1?'asg':'asb'); fl(se2,'✨',col);
    snd('bonus_turn');
    setInf('<span class="sd" style="background:'+col+'"></span> ✨ Tour supplémentaire !');
    await wt(Math.round(420*spd()));
  }
  if(!ex&&own(cur,p)&&B[cur]===1){
    const o=opp(cur);
    if(B[o]>0){
      cap=true; const cpt=B[o]+1;
      setInf('<span class="sd" style="background:'+CG+'"></span> Capture de <b>'+cpt+'</b> graines !');
      await wt(160);
      ta(gEl(cur),'acp'); ta(gEl(o),'acp'); snd('capture');
      Animations.vibrate([50,30,80]);
      await wt(Math.round(380*spd()));
      B[gs(p)]+=cpt; B[cur]=0; B[o]=0; uc(cur); uc(o); uc(gs(p));
      const st2=gEl(gs(p)); ta(st2,'asn'); fl(st2,'+'+cpt,CG);
      await wt(Math.round(300*spd()));
    }
  }
  return{ex,cap};
}

/* ══════════════════════════════════════════════════════════════
   CLICK HANDLER
   ══════════════════════════════════════════════════════════════ */
async function click(idx){
  const p=own(idx,1)?1:2;
  if(!canPlay(p)){
    // Shake feedback for wrong turn
    if(!over&&!busy){
      const el=gEl(idx);
      Animations.shakeEl(document.getElementById('bwrap'));
      snd('illegal');
      Animations.vibrate([40]);
      setInf('⚠️ Ce n\'est pas votre tour');
    }
    return;
  }
  if(!own(idx,p)||!B[idx]){
    Animations.shakeEl(gEl(idx)||document.getElementById('bwrap'));
    snd('illegal'); Animations.vibrate([40]);
    setInf('⚠️ Cette fosse est vide');
    return;
  }
  clrH(); SoundEngine.init();

  if(mode==='online'){
    const s=getSocket();
    if(!s||!s.connected){ setInf('Non connecté au serveur'); return; }
    if(busy)return;
    s.emit('move',Number(idx),res=>{
      if(!res||!res.ok){
        setInf(res&&res.error?res.error:'Coup invalide');
        Animations.shakeEl(document.getElementById('bwrap'));
        snd('illegal');
        rend();
      }
    });
    return;
  }

  // Save undo snapshot (offline only)
  _undoStack.push({ B:[...B], turn });
  if(_undoStack.length>10)_undoStack.shift();
  const undoBtn=document.getElementById('btn-undo');
  if(undoBtn&&mode!=='online') undoBtn.style.display='';

  busy=true; rend(false);
  const r=await animM(idx,p,{});
  chkEnd(); if(over){busy=false;return;}
  if(r.ex){ turn=p; busy=false; rend(); setInf('<span style="color:'+(p===1?C1:C2)+'">▶</span> '+pName(p)+' rejoue !'); }
  else if(mode==='ai'&&p===1){
    turn=2; rend(false);
    setInf('<span class="td"></span><span class="td"></span><span class="td"></span> L\'ordinateur réfléchit…');
    Animations.setThinking(true);
    await wt(diff===1?380:diff===2?600:850);
    await runAI();
  }
  else{ turn=p===1?2:1; busy=false; rend(); setTurnInf(); }
}

/* ══════════════════════════════════════════════════════════════
   AI TURN
   ══════════════════════════════════════════════════════════════ */
async function runAI(){
  Animations.setThinking(true);
  if(over||mode!=='ai'){ Animations.setThinking(false); return; }
  const m=aip();
  if(m===null){ Animations.setThinking(false); turn=1; busy=false; rend(); setInf('<span style="color:'+C1+'">▶</span> À vous de jouer !'); return; }
  const se=gEl(m); if(se)se.classList.add('sa');
  setInf('<span class="sd" style="background:'+C2+'"></span> Fosse n°'+(m-6)+' — '+B[m]+' graine'+(B[m]>1?'s':''));
  await wt(Math.round(380*spd()));
  Animations.setThinking(false);
  const r=await animM(m,2,{});
  chkEnd(); if(over){busy=false;return;}
  if(r.ex){ setInf('<span style="color:'+C2+'">▶</span> L\'ordi rejoue…'); await wt(diff===1?280:diff===2?450:680); await runAI(); }
  else { turn=1; busy=false; rend(); setInf('<span style="color:'+C1+'">▶</span> À vous de jouer !'); }
}

/* ══════════════════════════════════════════════════════════════
   END GAME
   ══════════════════════════════════════════════════════════════ */
function chkEnd(scores){
  const s1=P1.reduce((a,i)=>a+B[i],0), s2=P2.reduce((a,i)=>a+B[i],0);
  if(!s1||!s2){
    if(!scores){ P1.forEach(i=>{B[P1S]+=B[i];B[i]=0;}); P2.forEach(i=>{B[P2S]+=B[i];B[i]=0;}); }
    over=true; rendAll();
    const y=B[P1S], a=B[P2S];

    let result, msg;
    const yourScore = mode==='online'&&myPlayer===2 ? a : y;
    const oppScore  = mode==='online'&&myPlayer===2 ? y : a;
    const yourName  = pName(myPlayer||1);
    const oppName   = pName(myPlayer===1?2:1);

    if(mode==='ai'){
      if(y>a)       { result='win';  msg='🏆 Vous gagnez !'; snd('victory'); }
      else if(a>y)  { result='loss'; msg='Ordinateur gagne'; snd('defeat'); }
      else          { result='draw'; msg='🤝 Égalité !'; snd('draw'); }
    } else if(mode==='local'){
      if(y>a)       { result='win';  msg='🏆 Joueur 1 gagne !'; snd('victory'); }
      else if(a>y)  { result='win';  msg='🏆 Joueur 2 gagne !'; snd('victory'); }
      else          { result='draw'; msg='🤝 Égalité !'; snd('draw'); }
    } else {
      const mine=myPlayer===1?y:a, theirs=myPlayer===1?a:y;
      if(mine>theirs)   { result='win';  msg='🏆 Vous gagnez !'; snd('victory'); }
      else if(theirs>mine){ result='loss';msg='Adversaire gagne'; snd('defeat'); }
      else              { result='draw'; msg='🤝 Égalité !'; snd('draw'); }
    }

    // Show rich modal
    Animations.showEndModal({ result, yourScore, oppScore, yourName, oppName });
    setInf('Partie terminée');
    srAnnounce(msg);
    _undoStack=[];

    // Show vibration feedback
    if(result==='win')   Animations.vibrate([100,50,100,50,200]);
    else if(result==='loss') Animations.vibrate([200]);

    // Hide resign/draw buttons
    setGameActionBtns(false);
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDERING
   ══════════════════════════════════════════════════════════════ */
function setInf(h){ document.getElementById('inf').innerHTML=h; }
function srAnnounce(txt){ const el=document.getElementById('sr-announce'); if(el)el.textContent=txt; }

function rendHdr(){
  const ap=turn;
  if(mode==='online'){
    const me=myPlayer, myCls=me===2?' ap2':' ap1', oppCls=me===2?' ap1':' ap2';
    document.getElementById('cyo').className='player-card'+(ap===me&&!over?myCls:'');
    document.getElementById('cai').className='player-card'+(ap!==me&&!over?oppCls:'');
  } else {
    document.getElementById('cyo').className='player-card'+(ap===1&&!over?' ap1':'');
    document.getElementById('cai').className='player-card'+(ap===2&&!over?' ap2':'');
  }
  // Board glow when it's my turn
  const isMyTurn = mode==='local' ? true : (mode==='ai' ? turn===1 : turn===myPlayer);
  Animations.setBoardGlow(isMyTurn && !over && !busy && !gamePaused);
  // Thinking indicator — show when opponent is thinking
  const oppThinking = mode==='online' && turn!==myPlayer && !over && !busy;
  Animations.setThinking(oppThinking);
}

function rend(refreshPits){
  if(refreshPits!==false) requestAnimationFrame(rendAll);
  rendHdr();
}

function addPit(row, idx, player, label){
  const d=document.createElement('div'); d.className='pit';
  const ok=canPlay(player)&&B[idx]>0;
  const col=player===1?C1:C2;
  d.innerHTML=mkD(B[idx],col)+(label?'<span class="plb">'+label+'</span>':'');
  if(ok){ d.classList.add(player===1?'can':'can2'); bindPit(d,idx,player); }
  // Keyboard accessibility
  if(ok){ d.setAttribute('tabindex','0'); d.setAttribute('role','button'); d.setAttribute('aria-label','Fosse '+(label||idx)+' — '+B[idx]+' graine'+(B[idx]>1?'s':'')); }
  row.appendChild(d);
}

function bindPit(d,idx,p){
  d.onclick=(e)=>{e.preventDefault();click(idx);};
  d.onmouseenter=()=>{if(!busy)shPath(idx,p);};
  d.onmouseleave=clrH;
  d.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();click(idx);} });
  d.addEventListener('touchstart',(e)=>{if(!busy)shPath(idx,p);},{passive:true});
  d.addEventListener('touchend',()=>setTimeout(clrH,400),{passive:true});
}

function rendAll(){
  const mine=flipped()?P2S:P1S, oppIdx=flipped()?P1S:P2S;
  document.getElementById('svyo').textContent=B[mine];
  document.getElementById('svai').textContent=B[oppIdx];
  document.getElementById('scyo').textContent=B[mine];
  document.getElementById('scai').textContent=B[oppIdx];
  const ry=document.getElementById('ryo'); ry.innerHTML='';
  const ra=document.getElementById('rai'); ra.innerHTML='';
  if(flipped()){
    P2.forEach((idx,i)=>addPit(ry,idx,2,String(i+1)));
    [...P1].reverse().forEach(idx=>addPit(ra,idx,1,null));
  } else {
    P1.forEach((idx,i)=>addPit(ry,idx,1,String(i+1)));
    for(let i=12;i>=7;i--)addPit(ra,i,2,null);
  }
}

function updateLabels(){
  if(mode==='ai'){
    document.getElementById('lb-yo').textContent='Vous';
    document.getElementById('lb-ai').textContent='Ordinateur';
    document.getElementById('slb-yo').textContent='VOUS';
    document.getElementById('slb-ai').textContent='ORDI';
    document.getElementById('av-ai').textContent='🤖';
    document.getElementById('av-yo').textContent='👤';
    document.getElementById('dot-ai').className='status-dot';
  } else if(mode==='local'){
    document.getElementById('lb-yo').textContent='Joueur 1';
    document.getElementById('lb-ai').textContent='Joueur 2';
    document.getElementById('slb-yo').textContent='J1';
    document.getElementById('slb-ai').textContent='J2';
    document.getElementById('av-ai').textContent='👥';
    document.getElementById('dot-ai').className='status-dot';
  } else {
    document.getElementById('lb-yo').textContent='Vous';
    document.getElementById('lb-ai').textContent='Adversaire';
    document.getElementById('slb-yo').textContent='VOUS';
    document.getElementById('slb-ai').textContent='ADV';
    document.getElementById('dot-yo').className='status-dot online';
  }
}

/* ── Difficulty selector ─────────────────────────────────────── */
function sd(d,btn){
  diff=d;
  document.querySelectorAll('.db').forEach(b=>{
    b.classList.remove('on');
    b.setAttribute('aria-pressed','false');
  });
  btn.classList.add('on');
  btn.setAttribute('aria-pressed','true');
}

/* ══════════════════════════════════════════════════════════════
   TURN INFOBAR
   ══════════════════════════════════════════════════════════════ */
function setTurnInf(){
  if(gamePaused)return;
  const me=mode==='online'?myPlayer:turn;
  const col=turn===1?C1:C2;
  if(mode==='local'&&turn===2)       setInf('<span style="color:'+C2+'">▶</span> Joueur 2 — fosses <b>bleues en haut</b>');
  else if(mode==='local'&&turn===1)  setInf('<span style="color:'+C1+'">▶</span> Joueur 1 — fosses <b>dorées en bas</b>');
  else if(turn===me)                 setInf('<span style="color:'+col+'">▶</span> À vous de jouer !');
  else                               setInf('<span class="td"></span><span class="td"></span><span class="td"></span> Tour de l\'adversaire…');
  srAnnounce(turn===me?'À vous de jouer.':'Tour de l\'adversaire.');
  // Notify on your turn (online)
  if(mode==='online'&&turn===myPlayer&&_notifEnabled) snd('turn_notify');
}

/* ══════════════════════════════════════════════════════════════
   SHOW / HIDE GAME
   ══════════════════════════════════════════════════════════════ */
function setGameActionBtns(gameActive){
  const drawBtn   = document.getElementById('btn-draw');
  const resignBtn = document.getElementById('btn-resign');
  const undoBtn   = document.getElementById('btn-undo');
  if(drawBtn)   drawBtn.style.display   = (gameActive&&mode==='online')  ? '' : 'none';
  if(resignBtn) resignBtn.style.display = (gameActive&&mode==='online')  ? '' : 'none';
  if(undoBtn)   undoBtn.style.display   = (gameActive&&mode!=='online'&&_undoStack.length>0) ? '' : 'none';
}

function showGame(){
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  document.getElementById('diff-row').style.display=mode==='ai'?'flex':'none';
  const tags={ai:'🤖 Solo vs Ordinateur',local:'👥 Local à 2 joueurs',online:'🌐 En ligne — '+roomCode};
  document.getElementById('mode-tag').textContent=tags[mode]||'';
  Animations.hideEndModal();
  document.getElementById('em').style.display='none';
  document.getElementById('history-list').innerHTML='';
  _undoStack=[];
  updateLabels();
  setGameActionBtns(true);
  if(mode==='online'){
    busy=false;
    if(B.length){rend();setTurnInf();}
  } else {
    ng();
  }
}

/* ══════════════════════════════════════════════════════════════
   NEW GAME / REMATCH
   ══════════════════════════════════════════════════════════════ */
function ng(){
  if(mode==='online'&&socket&&roomCode){lastMoveSeq=-1;socket.emit('rematch');Animations.hideEndModal();return;}
  init(); turn=1; over=false; busy=false; lastMoveSeq=-1; _undoStack=[];
  Animations.hideEndModal();
  document.getElementById('em').style.display='none';
  document.getElementById('em').textContent='';
  document.getElementById('history-list').innerHTML='';
  clrH(); rend(); setTurnInf();
  setGameActionBtns(true);
}

/* ══════════════════════════════════════════════════════════════
   UNDO (offline only)
   ══════════════════════════════════════════════════════════════ */
function undoMove(){
  if(mode==='online'||!_undoStack.length||busy||over)return;
  const snapshot=_undoStack.pop();
  B=[...snapshot.B]; turn=snapshot.turn;
  const undoBtn=document.getElementById('btn-undo');
  if(undoBtn) undoBtn.style.display=_undoStack.length?'':'none';
  rend(); setTurnInf();
  toast('Coup annulé','warn');
  snd('click');
}

/* ══════════════════════════════════════════════════════════════
   RESIGN
   ══════════════════════════════════════════════════════════════ */
function confirmResign(){
  if(over||!socket||mode!=='online')return;
  // Show inline confirm
  let box=document.getElementById('resign-confirm');
  if(box){box.remove();return;}
  box=document.createElement('div');
  box.id='resign-confirm'; box.className='confirm-box';
  box.innerHTML='<h4>Abandonner la partie ?</h4><div class="confirm-btns"><button class="btn danger-btn" onclick="doResign()">Oui, abandonner</button><button class="btn ghost-btn" onclick="document.getElementById(\'resign-confirm\').remove()">Annuler</button></div>';
  document.body.appendChild(box);
}
function doResign(){
  const box=document.getElementById('resign-confirm'); if(box)box.remove();
  if(socket&&roomCode)socket.emit('leave');
  backToMenu();
}

/* ══════════════════════════════════════════════════════════════
   DRAW REQUEST (UI only — server ignores gracefully)
   ══════════════════════════════════════════════════════════════ */
function requestDraw(){
  if(over||_drawPending)return;
  _drawPending=true;
  toast('Proposition de nulle envoyée','warn');
  // Reset after 20s if not responded
  setTimeout(()=>{_drawPending=false;},20000);
}

/* ══════════════════════════════════════════════════════════════
   MOVE HISTORY
   ══════════════════════════════════════════════════════════════ */
function addHistoryEntry(mv){
  const list=document.getElementById('history-list');
  if(!list)return;
  const entry=document.createElement('div');
  entry.className='move-entry '+(mv.player===1?'p1':'p2');
  const pitLabel=mv.player===1
    ? 'Fosse '+(mv.pit+1)
    : 'Fosse '+(mv.pit-6);
  const badges=[];
  if(mv.captured>0) badges.push('<span class="m-badge">+'+mv.captured+' cap.</span>');
  if(mv.extra)      badges.push('<span class="m-badge ex">✨ bonus</span>');
  entry.innerHTML='<span class="m-info"><span>'+pitLabel+'</span><span>'+mv.seeds+' gr.</span></span><span>'+badges.join('')+'</span>';
  list.appendChild(entry);
  list.scrollTop=list.scrollHeight;
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */
function toast(msg, type='info', duration=3000){
  const container=document.getElementById('toast-container');
  if(!container)return;
  const t=document.createElement('div');
  t.className='toast '+(type||'');
  const icons={success:'✓',warn:'⚠',error:'✕',info:'ℹ'};
  t.innerHTML='<span>'+((icons[type]||'ℹ'))+'</span><span>'+msg+'</span>';
  container.appendChild(t);
  setTimeout(()=>{t.classList.add('fade-out');setTimeout(()=>t.remove(),350);},duration);
}
window.toast=toast;

/* ══════════════════════════════════════════════════════════════
   NETWORK STATUS
   ══════════════════════════════════════════════════════════════ */
function setNetIndicator(state, pingMs){
  const chip=document.getElementById('net-indicator');
  const dot =document.getElementById('net-dot');
  const text=document.getElementById('net-text');
  const ping=document.getElementById('net-ping');
  if(!chip)return;

  chip.classList.remove('hidden');

  if(state==='ok'){
    dot.className='net-dot ok';
    text.textContent='Connecté';
    if(ping&&pingMs!==undefined) ping.textContent=pingMs+'ms';
    // Auto-hide after 4s if online OK
    setTimeout(()=>{if(mode!=='online')chip.classList.add('hidden');},4000);
  } else if(state==='reconnecting'){
    dot.className='net-dot warn';
    text.textContent='Reconnexion…';
    if(ping)ping.textContent='';
  } else {
    dot.className='net-dot err';
    text.textContent='Hors ligne';
    if(ping)ping.textContent='';
  }
}

function updateConnStatus(msg){
  const el=document.getElementById('conn-status');
  if(!el)return;
  if(msg){el.textContent=msg;el.style.color='#FF7755';return;}
  if(!socket){el.textContent='Non connecté';el.style.color='#FF7755';return;}
  if(socket.connected){el.textContent='● Connecté au serveur';el.style.color='var(--emerald-light)';}
  else               {el.textContent='○ Reconnexion…';el.style.color='var(--gold)';}
}

/* ══════════════════════════════════════════════════════════════
   PAUSE BANNER (opponent disconnect)
   ══════════════════════════════════════════════════════════════ */
function hidePauseBanner(){
  gamePaused=false;
  if(pauseTimer){clearInterval(pauseTimer);pauseTimer=null;}
  const b=document.getElementById('pause-banner');
  if(b)b.classList.remove('show');
}

function showPauseBanner(endsAt,slot){
  gamePaused=true;
  const b=document.getElementById('pause-banner');
  const isMe=slot===myPlayer;
  document.getElementById('pause-title').textContent=isMe?'Connexion perdue — reconnectez-vous':'Adversaire déconnecté';
  document.getElementById('pause-sub').textContent=isMe
    ?'Rouvrez la page ou attendez la reconnexion automatique. Code : '+roomCode
    :'La partie reprendra s\'il revient avant la fin du délai.';
  b.classList.add('show');
  if(pauseTimer)clearInterval(pauseTimer);
  function tick(){
    const left=Math.max(0,endsAt-Date.now());
    const s=Math.ceil(left/1000),m=Math.floor(s/60),sec=s%60;
    document.getElementById('pause-cd').textContent=m+':'+(sec<10?'0':'')+sec;
    if(left<=0&&pauseTimer){clearInterval(pauseTimer);pauseTimer=null;}
  }
  tick(); pauseTimer=setInterval(tick,500);
  rend();
}

/* ══════════════════════════════════════════════════════════════
   ONLINE: SOCKET.IO
   ══════════════════════════════════════════════════════════════ */
function getSocket(){
  if(!socket){
    if(location.protocol==='file:'){
      updateConnStatus('Ouvrez http://localhost:3000 (pas le fichier HTML directement)');
      return null;
    }
    socket=io({
      transports:['polling','websocket'],
      reconnection:true,
      reconnectionAttempts:30,
      reconnectionDelay:1000,
      timeout:10000
    });
    socket.on('connect',()=>{
      updateConnStatus();
      setNetIndicator('ok');
      measurePing();
      snd('reconnect');
      if(roomCode&&myPlayer) rejoinOnline();
    });
    socket.on('disconnect',()=>{
      updateConnStatus();
      setNetIndicator('reconnecting');
    });
    socket.on('connect_error',()=>{
      updateConnStatus('Serveur inaccessible — lancez : npm start');
      setNetIndicator('offline');
    });
    listenOnline();
  }
  updateConnStatus();
  return socket;
}

function measurePing(){
  if(!socket||!socket.connected)return;
  const t0=Date.now();
  socket.emit('ping_check',()=>{
    _pingVal=Date.now()-t0;
    // Update ping UI on opponent card
    updatePingUI(_pingVal);
    setNetIndicator('ok',_pingVal);
  });
  // Fallback — socket.io built-in ping
  setTimeout(measurePing, 10000);
}

function updatePingUI(ms){
  const el=document.getElementById('ping-ai');
  if(!el)return;
  const bar=el.querySelector('.ping-bar');
  if(!bar)return;
  // Set quality class
  el.className='ping-indicator';
  if(ms<80)      el.classList.add('ping-good');
  else if(ms<200)el.classList.add('ping-mid');
  else           el.classList.add('ping-bad');
}

function startMode(m){
  mode=m; myPlayer=1; roomCode=null;
  SoundEngine.init(); snd('click');
  if(m==='online'){
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('lobby-create').classList.remove('hidden');
    document.getElementById('lobby-waiting').classList.add('hidden');
    document.getElementById('lobby-join').classList.remove('hidden');
    document.getElementById('lobby-err').textContent='';
    document.getElementById('join-code').value='';
    getSocket();
    return;
  }
  showGame();
}

function backToMenu(){
  hidePauseBanner(); clearSession();
  Animations.hideEndModal();
  if(socket&&roomCode){socket.emit('leave');roomCode=null;}
  document.getElementById('game').classList.add('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  over=true; busy=false;
  setNetIndicator('ok');
  if(mode!=='online') document.getElementById('net-indicator').classList.add('hidden');
}

function createRoom(){
  const s=getSocket();
  document.getElementById('lobby-err').textContent='';
  if(!s){document.getElementById('lobby-err').textContent='Serveur non disponible';return;}
  if(!s.connected){document.getElementById('lobby-err').textContent='Connexion en cours…';s.once('connect',createRoom);return;}
  s.emit('create',res=>{
    if(!res||!res.ok){document.getElementById('lobby-err').textContent='Erreur de création';return;}
    myPlayer=1; roomCode=res.code;
    document.getElementById('lobby-create').classList.add('hidden');
    document.getElementById('lobby-waiting').classList.remove('hidden');
    // Show segmented room code
    renderRoomCode(res.code);
    document.getElementById('share-url').textContent=location.origin+'  (code : '+res.code+')';
    if(res.state)applyState(res.state);
    saveSession();
  });
}

function renderRoomCode(code){
  const container=document.getElementById('room-code-digits');
  if(!container){
    // Fallback: old single element
    const old=document.getElementById('room-code');
    if(old)old.textContent=code;
    return;
  }
  container.innerHTML='';
  [...code].forEach(ch=>{
    const d=document.createElement('div');
    d.className='rc-digit'; d.textContent=ch;
    container.appendChild(d);
  });
}

function joinRoom(){
  const code=document.getElementById('join-code').value.trim().toUpperCase();
  if(code.length<4){document.getElementById('lobby-err').textContent='Entrez un code valide';return;}
  const s=getSocket();
  document.getElementById('lobby-err').textContent='';
  if(!s){document.getElementById('lobby-err').textContent='Serveur non disponible';return;}
  if(!s.connected){document.getElementById('lobby-err').textContent='Connexion en cours…';s.once('connect',joinRoom);return;}
  s.emit('join',code,res=>{
    if(!res||!res.ok){document.getElementById('lobby-err').textContent=res.error||'Impossible de rejoindre';return;}
    myPlayer=res.player; roomCode=res.code;
    if(res.state){lastMoveSeq=-1;applyState(res.state);updateLabels();showGame();saveSession();}
  });
}

function copyCode(){
  if(!roomCode)return;
  const shareText=roomCode;
  if(navigator.clipboard){
    navigator.clipboard.writeText(shareText).then(()=>toast('Code copié !','success')).catch(()=>legacyCopy(shareText));
  } else { legacyCopy(shareText); }
}
function legacyCopy(txt){
  const el=document.createElement('textarea'); el.value=txt;
  el.style.position='absolute'; el.style.opacity='0';
  document.body.appendChild(el); el.select();
  try{document.execCommand('copy');toast('Code copié !','success');}catch(e){toast('Copiez : '+txt,'info');}
  document.body.removeChild(el);
}

/* ══════════════════════════════════════════════════════════════
   ONLINE GAME STATE
   ══════════════════════════════════════════════════════════════ */
function handleOpponentLeft(data){
  hidePauseBanner(); clearSession();
  over=true; busy=false; pendingState=null;
  const reason=data&&data.reason;
  const msg=reason==='left'?'L\'adversaire a quitté la partie.':reason==='timeout'?'L\'adversaire n\'est pas revenu à temps.':'Adversaire déconnecté.';
  Animations.showEndModal({ result:'win', yourScore:B[myPlayer===1?P1S:P2S], oppScore:B[myPlayer===1?P2S:P1S], yourName:'Vous', oppName:'Adversaire' });
  setInf('Partie terminée'); rend();
  document.getElementById('em').textContent=msg; document.getElementById('em').style.display='block';
}

function tryStartOnlineGame(st){
  if(mode!=='online'||!st||!st.players||!st.players[1]||!st.players[2])return false;
  if(!document.getElementById('game').classList.contains('hidden'))return false;
  applyState(st); updateLabels(); showGame();
  // Match found animation then countdown
  Animations.matchFound({},()=>{ /* game already shown */ });
  return true;
}

function applyState(st){
  if(!st)return;
  B=(st.board||st.B||[]).slice();
  turn=st.currentPlayer||st.turn||1;
  over=!!st.over;
  roomCode=st.code||roomCode;
  if(st.moveSeq!==undefined)lastMoveSeq=st.moveSeq;
  if(st.paused&&st.graceEndsAt)showPauseBanner(st.graceEndsAt,st.disconnectedSlot);
  else if(!st.paused)hidePauseBanner();
  if(!over){ Animations.hideEndModal(); document.getElementById('em').style.display='none'; document.getElementById('em').textContent=''; }
  busy=false; rend();
  if(over&&st.scores){B[P1S]=st.scores.p1;B[P2S]=st.scores.p2;chkEnd(st.scores);}
  else if(!over)setTurnInf();
}

async function animOnlineMove(mv){
  const{pit,player,seeds,extra,captured,lastPit}=mv;
  if(!seeds)return;
  const baseSpd=seeds<=6?215:seeds<=12?170:seeds<=20?130:90;
  const s=Math.round(baseSpd*spd());
  const col=player===1?C1:C2, rc=player===1?'ar':'ara';
  setInf('<span class="sd" style="background:'+col+'"></span> <b>'+seeds+'</b> graine'+(seeds>1?'s':'')+'…');
  const se=gEl(pit); if(se)se.classList.add(player===1?'sp':'sa');
  ta(se,'adp'); snd('move'); await wt(Math.round(s*0.6));
  if(se)se.classList.remove('sp','sa');
  let cur=pit;
  for(let i=0;i<seeds;i++){
    const prev=cur; cur=nx(cur,player);
    fly(prev,cur,col); await wt(Math.round(s*0.42));
    const el=gEl(cur); ta(el,rc); fl(el,'+1',col);
    if(i%Math.max(1,Math.floor(seeds/8))===0)snd('move');
    await wt(Math.round(s*0.58));
  }
  if(extra){ const se2=gEl(gs(player)); ta(se2,player===1?'asg':'asb'); fl(se2,'✨',col); snd('bonus_turn'); setInf('<span class="sd" style="background:'+col+'"></span> ✨ Tour supplémentaire !'); await wt(Math.round(420*spd())); }
  if(!extra&&captured>0&&lastPit!==undefined){
    const capFrom=opp(lastPit);
    setInf('<span class="sd" style="background:'+CG+'"></span> Capture de <b>'+captured+'</b> graines !');
    await wt(160); ta(gEl(lastPit),'acp'); ta(gEl(capFrom),'acp'); snd('capture'); Animations.vibrate([50,30,80]); await wt(Math.round(380*spd()));
    const st2=gEl(gs(player)); ta(st2,'asn'); fl(st2,'+'+captured,CG); await wt(Math.round(300*spd()));
  }
  // Add to history
  addHistoryEntry({player,pit,seeds,extra,captured:captured||0});
}

async function handleGameState(srvState){
  if(!srvState)return;
  if(tryStartOnlineGame(srvState))return;
  if(mode!=='online')return;
  const seq=srvState.lastMove?srvState.lastMove.seq:-1;
  if(!srvState.lastMove||seq<=lastMoveSeq){applyState(srvState);return;}
  if(busy){pendingState=srvState;return;}
  lastMoveSeq=seq; busy=true;
  try{
    rend(false);
    await animOnlineMove(srvState.lastMove);
    B=(srvState.board||[]).slice();
    turn=srvState.currentPlayer||1;
    over=!!srvState.over;
    if(over){ if(srvState.scores){B[P1S]=srvState.scores.p1;B[P2S]=srvState.scores.p2;} rendAll(); chkEnd(srvState.scores); }
    else{ rend(); setTurnInf(); }
  } finally {
    busy=false;
    if(pendingState){const ps=pendingState;pendingState=null;handleGameState(ps);}
    else if(!over)rend();
  }
}

function listenOnline(){
  if(!socket._songo){ socket._songo=true;
    socket.on('gameState',srvState=>{ if(!srvState)return; handleGameState(srvState); });
    socket.on('player_disconnected',d=>{ if(d&&d.graceEndsAt)showPauseBanner(d.graceEndsAt,d.slot); else{gamePaused=true;rend();} });
    socket.on('player_rejoined',()=>{ hidePauseBanner(); snd('reconnect'); toast('Adversaire de retour — la partie reprend !','success'); setTurnInf(); });
    socket.on('opponent_left',data=>handleOpponentLeft(data));
    // Expose ping endpoint (server responds via ack)
    socket.on('pong_check',()=>{});
  }
}

/* ══════════════════════════════════════════════════════════════
   SESSION PERSISTENCE
   ══════════════════════════════════════════════════════════════ */
function saveSession(){ if(mode==='online'&&roomCode&&myPlayer){ sessionStorage.setItem('songo',JSON.stringify({code:roomCode,player:myPlayer})); } else sessionStorage.removeItem('songo'); }
function clearSession(){ sessionStorage.removeItem('songo'); }
function rejoinOnline(){
  if(mode!=='online'||!roomCode||!myPlayer)return;
  const s=getSocket(); if(!s||!s.connected)return;
  s.emit('rejoin',roomCode,myPlayer,res=>{
    if(res&&res.ok&&res.state){ applyState(res.state); updateLabels(); saveSession(); if(document.getElementById('game').classList.contains('hidden'))showGame(); }
    else if(res&&!res.ok) clearSession();
  });
}

// Auto-rejoin on page load
(function(){
  try{
    const raw=sessionStorage.getItem('songo'); if(!raw)return;
    const s=JSON.parse(raw);
    if(s.code&&s.player){ roomCode=s.code; myPlayer=s.player; mode='online'; window.addEventListener('load',()=>getSocket()); }
  }catch(e){clearSession();}
})();

/* ══════════════════════════════════════════════════════════════
   SETTINGS PANEL
   ══════════════════════════════════════════════════════════════ */
function openSettings(){
  const panel=document.getElementById('settings-panel');
  const backdrop=document.getElementById('settings-backdrop');
  SoundEngine.init();
  // Sync current state to controls
  const soundToggle=document.getElementById('sound-toggle');
  const musicToggle=document.getElementById('music-toggle');
  const themeToggle=document.getElementById('theme-toggle');
  const animSpeedEl=document.getElementById('anim-speed');
  const notifToggle=document.getElementById('notif-toggle');
  const vibrToggle =document.getElementById('vibration-toggle');
  if(soundToggle) soundToggle.checked=!SoundEngine.isMuted();
  if(musicToggle) musicToggle.checked=!SoundEngine.isMusicMuted();
  if(themeToggle) themeToggle.checked=document.documentElement.getAttribute('data-theme')!=='light';
  if(animSpeedEl) animSpeedEl.value=_animSpeed;
  if(notifToggle) notifToggle.checked=_notifEnabled;
  if(vibrToggle)  vibrToggle.checked=_vibrateEnabled;
  if(panel)  { panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); }
  if(backdrop){ backdrop.style.display='block'; }
}

function closeSettings(){
  const panel=document.getElementById('settings-panel');
  const backdrop=document.getElementById('settings-backdrop');
  if(panel)  { panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); }
  if(backdrop){ backdrop.style.display='none'; }
}

function toggleSound(){
  SoundEngine.toggle();
}
function toggleMusic(){
  SoundEngine.toggleMusic();
}
function toggleTheme(){
  const html=document.documentElement;
  const isLight=html.getAttribute('data-theme')==='light';
  html.setAttribute('data-theme', isLight?'dark':'light');
  localStorage.setItem('songo_theme', isLight?'dark':'light');
}
function setAnimSpeed(val){
  _animSpeed=val;
  localStorage.setItem('songo_anim',val);
}
function toggleNotif(){
  _notifEnabled=!_notifEnabled;
  localStorage.setItem('songo_notif',_notifEnabled.toString());
}
function toggleVibration(){
  _vibrateEnabled=!_vibrateEnabled;
  window._vibrateEnabled=_vibrateEnabled;
  localStorage.setItem('songo_vibrate',_vibrateEnabled.toString());
}

// Restore theme on load
(function(){
  const saved=localStorage.getItem('songo_theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);
})();

/* ══════════════════════════════════════════════════════════════
   KEYBOARD NAVIGATION
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape'){
    closeSettings();
    const resignBox=document.getElementById('resign-confirm');
    if(resignBox)resignBox.remove();
  }
  // Tab through pits is handled by tabindex on pit elements
  // Shortcut: 1-6 keys for your pits
  if(!over&&!busy&&!gamePaused&&document.getElementById('game')&&!document.getElementById('game').classList.contains('hidden')){
    const n=parseInt(e.key,10);
    if(n>=1&&n<=6){
      // Map 1-6 to your pit indices
      const pitIdx=flipped()?(n+6):(n-1);
      if(B[pitIdx]>0&&canPlay(myPlayer===2?2:1))click(pitIdx);
    }
  }
});

/* ══════════════════════════════════════════════════════════════
   RESPONSIVE RE-RENDER
   ══════════════════════════════════════════════════════════════ */
let resizeT;
window.addEventListener('resize',()=>{
  clearTimeout(resizeT);
  resizeT=setTimeout(()=>{
    const g=document.getElementById('game');
    if(g&&!g.classList.contains('hidden')&&!busy) requestAnimationFrame(rendAll);
  },200);
});
window.addEventListener('orientationchange',()=>setTimeout(()=>{
  const g=document.getElementById('game');
  if(g&&!g.classList.contains('hidden')&&!busy) requestAnimationFrame(rendAll);
},300));