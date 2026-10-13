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
let gameClock=null, p1Time=0, p2Time=0;
// UX state
let _undoStack   = [];   // { B, turn } snapshots for offline undo
let _pingTimer   = null;
let _pingVal     = null;
let _notifEnabled = localStorage.getItem('songo_notif') !== 'false';
let _vibrateEnabled = localStorage.getItem('songo_vibrate') !== 'false';
window._vibrateEnabled = _vibrateEnabled;
let _animSpeed   = localStorage.getItem('songo_anim') || 'normal';
let _drawPending = false;
let _matchRecorded = false;
let _selectedAvatar = '👤';

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

function formatTime(s) {
  if(s<0) s=0; const m=Math.floor(s/60), sec=s%60;
  return m+':'+(sec<10?'0':'')+sec;
}
function stopTimers() {
  if(gameClock){ clearInterval(gameClock); gameClock=null; }
}
function startTimers() {
  stopTimers();
  const ty=document.getElementById('time-yo'), ta=document.getElementById('time-ai');
  if(!ty || !ta) return;
  if(mode!=='ai' || !aiConfig.time){ ty.textContent='∞'; ta.textContent='∞'; return; }
  p1Time = p2Time = aiConfig.time * 60;
  ty.textContent = formatTime(p1Time); ta.textContent = formatTime(p2Time);
  gameClock = setInterval(()=>{
    if(over || busy || gamePaused) return;
    if(turn===1){ p1Time--; ty.textContent=formatTime(p1Time); if(p1Time<=0)handleTimeOut(1); }
    else { p2Time--; ta.textContent=formatTime(p2Time); if(p2Time<=0)handleTimeOut(2); }
  }, 1000);
}
function handleTimeOut(lostP) {
  stopTimers();
  if(_matchRecorded) return;
  over=true; rendAll();
  const y=B[P1S], a=B[P2S];
  finishGame({ result:lostP===1?'loss':'win', yourScore:y, oppScore:a, reason:'timeout' });
  srAnnounce(lostP===1?'Temps écoulé — défaite':'Temps écoulé — victoire');
}

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
function aiMt(){ const mv=P2.filter(i=>B[i]>0); if(!mv.length)return null; let best=null,bs=-Infinity; mv.forEach(m=>{let t=[...B];const r=apM(t,m,2);let s=scB(t); if(r.ex){const m2=P2.filter(i=>t[i]>0);if(m2.length){let b2=-Infinity;m2.forEach(mm=>{let t2=[...t];const r2=apM(t2,mm,2);let s2=scB(t2); if(r2.ex)s2+=3; b2=Math.max(b2,s2);});s+=b2*0.8;}} else{const om=P1.filter(i=>t[i]>0);if(om.length){let w=Infinity;om.forEach(mm=>{let t2=[...t];const r2=apM(t2,mm,1);let s2=scB(t2); if(r2.ex){const m3=P1.filter(i=>t2[i]>0);if(m3.length){let w2=Infinity;m3.forEach(mmm=>{let t3=[...t2];apM(t3,mmm,1);w2=Math.min(w2,scB(t3));});s2=Math.min(s2,w2)-2;}} w=Math.min(w,s2);});s=s*0.3+w*0.7;}} if(s>bs){bs=s;best=m;}}); return best; }
function aip(){ return diff===1?aiEz():diff===2?aiMd():diff===3?aiHd():aiMt(); }

/* ══════════════════════════════════════════════════════════════
   GAME STATE HELPERS
   ══════════════════════════════════════════════════════════════ */
function pName(p){
  const me=Profile.displayName();
  if(mode==='ai') return p===1?me:Profile.aiOpponent(diff).name;
  if(mode==='local') return p===1?me:'Joueur 2';
  return p===myPlayer?me:'Adversaire';
}
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

  const ex=cur===gs(p); let cap=0;
  if(ex){
    const se2=gEl(gs(p)); ta(se2,p===1?'asg':'asb'); fl(se2,'✨',col);
    snd('bonus_turn');
    setInf('<span class="sd" style="background:'+col+'"></span> ✨ Tour supplémentaire !');
    await wt(Math.round(420*spd()));
  }
  if(!ex&&own(cur,p)&&B[cur]===1){
    const o=opp(cur);
    if(B[o]>0){
      cap=B[o]+1;
      setInf('<span class="sd" style="background:'+CG+'"></span> Capture de <b>'+cap+'</b> graines !');
      await wt(160);
      ta(gEl(cur),'acp'); ta(gEl(o),'acp'); snd('capture');
      Animations.vibrate([50,30,80]);
      await wt(Math.round(380*spd()));
      B[gs(p)]+=cap; B[cur]=0; B[o]=0; uc(cur); uc(o); uc(gs(p));
      const st2=gEl(gs(p)); ta(st2,'asn'); fl(st2,'+'+cap,CG);
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

  const numSeeds = B[idx];
  busy=true; rend(false);
  const r=await animM(idx,p,{});
  addHistoryEntry({player: p, pit: idx, seeds: numSeeds, extra: r.ex, captured: r.cap});
  
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
  const numSeeds = B[m];
  setInf('<span class="sd" style="background:'+C2+'"></span> Fosse n°'+(m-6)+' — '+B[m]+' graine'+(B[m]>1?'s':''));
  await wt(Math.round(380*spd()));
  Animations.setThinking(false);
  const r=await animM(m,2,{});
  addHistoryEntry({player: 2, pit: m, seeds: numSeeds, extra: r.ex, captured: r.cap});
  
  chkEnd(); if(over){busy=false;return;}
  if(r.ex){ setInf('<span style="color:'+C2+'">▶</span> L\'ordi rejoue…'); await wt(diff===1?280:diff===2?450:680); await runAI(); }
  else { turn=1; busy=false; rend(); setInf('<span style="color:'+C1+'">▶</span> À vous de jouer !'); }
}

/* ══════════════════════════════════════════════════════════════
   END GAME
   ══════════════════════════════════════════════════════════════ */
function finishGame({ result, yourScore, oppScore, reason, silent, fromServer, rec }) {
  if(_matchRecorded) return null;
  if(mode==='online'&&!fromServer){
    over=true; stopTimers(); setGameActionBtns(false);
    return null;
  }
  if(mode==='online'&&roomCode&&sessionStorage.getItem('songo_rec_'+roomCode)){
    _matchRecorded=true; return null;
  }
  over=true;
  stopTimers();
  const opp=Profile.opponentMeta(mode, diff);
  let record=rec;
  if(fromServer){
    if(record&&record.player) Profile.applySnapshot(record.player);
    if(!record) record={ eloDelta:0, newElo:Profile.get().elo, rated:true };
  } else {
    const payload={
      mode,
      result,
      yourScore,
      oppScore,
      oppName: mode==='ai' ? (opp.name+' · '+opp.title) : opp.name,
      oppAvatar: opp.avatar,
      rated: mode==='ai',
      oppElo: opp.elo,
      aiDiff: mode==='ai'?diff:null,
      timeControl: (mode==='ai'&&aiConfig.time)?(aiConfig.time+' min'):'∞',
      reason: reason||'normal'
    };
    record=Profile.recordMatch(payload);
    Profile.postMatch(payload).then(data=>{
      if(!data||!data.player) return;
      Profile.applySnapshot(data.player, data.matches);
      applyProfileToUI();
      const deltaEl=document.getElementById('end-elo-delta');
      const newEl=document.getElementById('end-elo-new');
      if(deltaEl&&data.eloDelta!==undefined){
        const d=data.eloDelta|0;
        deltaEl.textContent=(d>0?'+':'')+d;
        deltaEl.className='end-elo-delta '+(d>0?'up':d<0?'down':'flat');
      }
      if(newEl&&data.newElo!=null) newEl.textContent=String(data.newElo);
    });
  }
  _matchRecorded=true;
  if(mode==='online'&&roomCode) sessionStorage.setItem('songo_rec_'+roomCode,'1');
  applyProfileToUI();
  if(silent) return record;
  if(result==='win') snd('victory');
  else if(result==='loss') snd('defeat');
  else snd('draw');
  if(result==='win') Animations.vibrate([100,50,100,50,200]);
  else if(result==='loss') Animations.vibrate([200]);
  Animations.showEndModal({
    result,
    yourScore,
    oppScore,
    yourName: Profile.displayName(),
    oppName: opp.name,
    eloDelta: record.eloDelta,
    newElo: record.newElo,
    rated: record.rated
  });
  setInf('Partie terminée');
  setGameActionBtns(false);
  return record;
}

function chkEnd(scores){
  const s1=P1.reduce((a,i)=>a+B[i],0), s2=P2.reduce((a,i)=>a+B[i],0);
  if(!s1||!s2){
    if(_matchRecorded){ over=true; rendAll(); return; }
    if(!scores){ P1.forEach(i=>{B[P1S]+=B[i];B[i]=0;}); P2.forEach(i=>{B[P2S]+=B[i];B[i]=0;}); }
    over=true; rendAll();
    const y=B[P1S], a=B[P2S];
    const yourScore = mode==='online'&&myPlayer===2 ? a : y;
    const oppScore  = mode==='online'&&myPlayer===2 ? y : a;

    let result, msg;
    if(mode==='ai'){
      if(y>a)       { result='win';  msg='🏆 Vous gagnez !'; }
      else if(a>y)  { result='loss'; msg=Profile.aiOpponent(diff).name+' gagne'; }
      else          { result='draw'; msg='🤝 Égalité !'; }
    } else if(mode==='local'){
      if(y>a)       { result='win';  msg='🏆 '+Profile.displayName()+' gagne !'; }
      else if(a>y)  { result='loss'; msg='🏆 Joueur 2 gagne !'; }
      else          { result='draw'; msg='🤝 Égalité !'; }
    } else {
      if(yourScore>oppScore)    { result='win';  msg='🏆 Vous gagnez !'; }
      else if(oppScore>yourScore){ result='loss';msg='Adversaire gagne'; }
      else                      { result='draw'; msg='🤝 Égalité !'; }
    }

    if(mode==='online'){
      over=true; rendAll(); setGameActionBtns(false);
      srAnnounce(msg);
      return;
    }
    finishGame({ result, yourScore, oppScore, reason:'normal' });
    srAnnounce(msg);
    _undoStack=[];
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
  const me=Profile.get();
  const myName=Profile.displayName();
  document.getElementById('av-yo').textContent=me.avatar;
  document.getElementById('flag-yo').textContent=me.flag;
  document.getElementById('elo-yo').textContent=String(me.elo);
  document.getElementById('lb-yo').textContent=myName;

  if(mode==='ai'){
    const opp=Profile.aiOpponent(diff);
    document.getElementById('lb-ai').textContent=opp.name;
    document.getElementById('slb-yo').textContent='VOUS';
    document.getElementById('slb-ai').textContent=opp.title.toUpperCase().slice(0,6);
    document.getElementById('av-ai').textContent=opp.avatar;
    document.getElementById('flag-ai').textContent=opp.flag;
    document.getElementById('elo-ai').textContent=String(opp.elo);
    document.getElementById('dot-ai').className='status-dot';
    const diffTag=document.getElementById('diff-tag');
    if(diffTag){ diffTag.textContent=opp.title; diffTag.style.display=''; }
  } else if(mode==='local'){
    document.getElementById('lb-ai').textContent='Joueur 2';
    document.getElementById('slb-yo').textContent='J1';
    document.getElementById('slb-ai').textContent='J2';
    document.getElementById('av-ai').textContent='👥';
    document.getElementById('flag-ai').textContent='🇨🇲';
    document.getElementById('elo-ai').textContent='—';
    document.getElementById('dot-ai').className='status-dot';
  } else {
    const opp=Profile.opponentMeta('online');
    document.getElementById('lb-ai').textContent=opp.name;
    document.getElementById('slb-yo').textContent='VOUS';
    document.getElementById('slb-ai').textContent='ADV';
    document.getElementById('av-ai').textContent=opp.avatar;
    document.getElementById('flag-ai').textContent=opp.flag;
    document.getElementById('elo-ai').textContent=String(opp.elo);
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
  if(window.Router && Router.current() !== '/game') Router.navigate('/game');
  const tags={ai:'🤖 Solo vs Ordinateur',local:'👥 Local à 2 joueurs',online:'🌐 En ligne — '+roomCode};
  document.getElementById('mode-tag').textContent=tags[mode]||'';
  Animations.hideEndModal();
  document.getElementById('em').style.display='none';
  document.getElementById('history-list').innerHTML='';
  _undoStack=[];
  _matchRecorded=false;
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
  if(mode==='online'&&socket&&roomCode){
    lastMoveSeq=-1; _matchRecorded=false;
    sessionStorage.removeItem('songo_rec_'+roomCode);
    socket.emit('rematch'); Animations.hideEndModal(); return;
  }
  init(); turn=1;
  if(mode==='ai'){
    if(aiConfig.start==='ai') turn=2;
    else if(aiConfig.start==='random') turn=Math.random()<0.5?1:2;
  }
  over=false; busy=false; lastMoveSeq=-1; _undoStack=[]; _matchRecorded=false;
  Animations.hideEndModal();
  document.getElementById('em').style.display='none';
  document.getElementById('em').textContent='';
  document.getElementById('history-list').innerHTML='';
  clrH(); rend(); setTurnInf();
  setGameActionBtns(true);
  startTimers();
  if(mode==='ai' && turn===2) setTimeout(runAI, 400);
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
  if(over||_drawPending||mode!=='online'||!socket)return;
  _drawPending=true;
  socket.emit('draw_offer',res=>{
    if(!res||!res.ok){ _drawPending=false; toast(res&&res.error?res.error:'Impossible de proposer nulle','warn'); return; }
    if(res.accepted) return;
    toast('Proposition de nulle envoyée','warn');
  });
  setTimeout(()=>{_drawPending=false;},20000);
}

function showDrawOffer(){
  let box=document.getElementById('draw-confirm');
  if(box) box.remove();
  box=document.createElement('div');
  box.id='draw-confirm'; box.className='confirm-box';
  box.innerHTML='<h4>L\'adversaire propose nulle</h4><div class="confirm-btns">'
    +'<button class="btn primary-btn" onclick="respondDraw(true)">Accepter</button>'
    +'<button class="btn ghost-btn" onclick="respondDraw(false)">Refuser</button></div>';
  document.body.appendChild(box);
}

function respondDraw(accept){
  const box=document.getElementById('draw-confirm'); if(box)box.remove();
  _drawPending=false;
  if(socket) socket.emit('draw_respond', !!accept);
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
      timeout:10000,
      auth:{ token: Profile.token() }
    });
    socket.on('connect',()=>{
      updateConnStatus();
      setNetIndicator('ok');
      measurePing();
      snd('reconnect');
      if(Profile.token()) socket.emit('identify', Profile.token());
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
    if(window.Router && Router.current() !== '/lobby') Router.navigate('/lobby');
    return;
  }
  if(m==='ai'){
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('ai-setup').classList.remove('hidden');
    return;
  }
  showGame();
}

let aiConfig = { diff: 1, time: 0, start: 'user' };

function selectSetupOpt(category, value, el) {
  aiConfig[category] = value;
  document.querySelectorAll('.' + category + '-opt').forEach(btn => btn.classList.remove('active'));
  el.classList.add('active');
  snd('click');
}

function launchAIGame() {
  snd('click');
  diff = aiConfig.diff;
  document.getElementById('ai-setup').classList.add('hidden');
  showGame();
}

function backToMenu(){
  hidePauseBanner(); clearSession();
  stopTimers();
  const diffTag = document.getElementById('diff-tag');
  if(diffTag) { diffTag.textContent=''; diffTag.style.display='none'; }
  Animations.hideEndModal();
  if(socket&&roomCode){socket.emit('leave');roomCode=null;}
  document.getElementById('game').classList.add('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('ai-setup').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  over=true; busy=false;
  setNetIndicator('ok');
  if(mode!=='online') document.getElementById('net-indicator').classList.add('hidden');
  applyProfileToUI();
  if(window.Router && Router.current() !== '/home') Router.navigate('/home');
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
  const game=document.getElementById('game');
  const inGame=game&&!game.classList.contains('hidden');
  const reason=data&&data.reason;
  const msg=reason==='left'?'L\'adversaire a quitté la partie.':reason==='timeout'?'L\'adversaire n\'est pas revenu à temps.':'Adversaire déconnecté.';
  if(!inGame) return;
  over=true; busy=false; pendingState=null;
  rend();
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
  if(st.profiles){
    const oppSlot=myPlayer===2?1:2;
    Profile.setOnlineOpponent(st.profiles[oppSlot]||null);
  }
  B=(st.board||st.B||[]).slice();
  turn=st.currentPlayer||st.turn||1;
  over=!!st.over;
  roomCode=st.code||roomCode;
  if(st.moveSeq!==undefined)lastMoveSeq=st.moveSeq;
  if(st.paused&&st.graceEndsAt)showPauseBanner(st.graceEndsAt,st.disconnectedSlot);
  else if(!st.paused)hidePauseBanner();
  if(!over){
    _matchRecorded=false;
    Animations.hideEndModal(); document.getElementById('em').style.display='none'; document.getElementById('em').textContent='';
  } else if(roomCode&&sessionStorage.getItem('songo_rec_'+roomCode)){
    _matchRecorded=true;
  }
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
    socket.on('match_result',data=>{
      if(!data||!data.bySlot) return;
      const mine=data.bySlot[myPlayer];
      if(!mine) return;
      const y=mine.match?mine.match.yourScore:(myPlayer===1?B[P1S]:B[P2S]);
      const a=mine.match?mine.match.oppScore:(myPlayer===1?B[P2S]:B[P1S]);
      finishGame({
        result: mine.result,
        yourScore: y,
        oppScore: a,
        reason: data.reason||'normal',
        fromServer: true,
        rec: mine
      });
    });
    socket.on('draw_offered',d=>{
      if(!d||d.slot===myPlayer) return;
      showDrawOffer();
    });
    socket.on('draw_declined',()=>{
      _drawPending=false;
      const box=document.getElementById('draw-confirm'); if(box)box.remove();
      toast('Nulle refusée','warn');
    });
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
   PROFILE / STATS UI
   ══════════════════════════════════════════════════════════════ */
function fillAiOpponents(){
  const grid=document.getElementById('ai-opp-grid');
  if(!grid||!window.Profile) return;
  grid.innerHTML='';
  [1,2,3,4].forEach(d=>{
    const opp=Profile.aiOpponent(d);
    const b=document.createElement('button');
    b.type='button';
    b.className='btn ghost-btn setup-opt diff-opt'+(aiConfig.diff===d?' active':'');
    b.style.justifyContent='flex-start';
    b.style.flexDirection='column';
    b.style.alignItems='flex-start';
    b.style.gap='2px';
    b.onclick=function(){ selectSetupOpt('diff', d, this); };
    b.innerHTML='<span>'+opp.avatar+' '+Profile.esc(opp.name)+'</span><span style="font-size:0.72rem;color:var(--text-muted);font-weight:500">'+Profile.esc(opp.title)+' · '+opp.elo+'</span>';
    grid.appendChild(b);
  });
}

function applyProfileToUI(){
  const p=Profile.get();
  const name=Profile.displayName();
  const setTxt=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  setTxt('menu-av', p.avatar);
  setTxt('menu-name', name);
  setTxt('menu-flag', p.flag);
  setTxt('menu-elo', String(p.elo));
  setTxt('menu-record', p.stats.wins+'V – '+p.stats.losses+'D – '+p.stats.draws+'N');
  setTxt('av-yo', p.avatar);
  setTxt('flag-yo', p.flag);
  setTxt('elo-yo', String(p.elo));
  const lb=document.getElementById('lb-yo');
  const game=document.getElementById('game');
  if(lb&&game&&!game.classList.contains('hidden')) lb.textContent=name;
}

function fillAvatarGrid(){
  const grid=document.getElementById('avatar-grid');
  if(!grid) return;
  grid.innerHTML='';
  Profile.AVATARS.forEach(av=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='avatar-opt'+(_selectedAvatar===av?' selected':'');
    b.textContent=av;
    b.setAttribute('role','option');
    b.setAttribute('aria-selected', _selectedAvatar===av?'true':'false');
    b.onclick=()=>{
      _selectedAvatar=av;
      grid.querySelectorAll('.avatar-opt').forEach(x=>{
        x.classList.remove('selected');
        x.setAttribute('aria-selected','false');
      });
      b.classList.add('selected');
      b.setAttribute('aria-selected','true');
    };
    grid.appendChild(b);
  });
}

function fillCountrySelect(current){
  const sel=document.getElementById('profile-country');
  if(!sel) return;
  sel.innerHTML='';
  Profile.COUNTRIES.forEach(c=>{
    const o=document.createElement('option');
    o.value=c.code;
    o.textContent=c.emoji+'  '+c.name;
    if(c.code===current) o.selected=true;
    sel.appendChild(o);
  });
}

function openProfile(){
  const p=Profile.get();
  _selectedAvatar=p.avatar;
  const title=document.getElementById('profile-title');
  const intro=document.getElementById('profile-intro');
  const skip=document.getElementById('profile-skip');
  if(title) title.textContent=p.setupDone?'Votre profil':'Bienvenue';
  if(intro) intro.classList.toggle('hidden', !!p.setupDone);
  if(skip) skip.style.display=p.setupDone?'none':'';
  const nameEl=document.getElementById('profile-name');
  if(nameEl) nameEl.value=p.name;
  fillAvatarGrid();
  fillCountrySelect(p.country);
  document.getElementById('profile-overlay').classList.remove('hidden');
  if(nameEl) setTimeout(()=>nameEl.focus(), 50);
}

function closeProfile(){
  const el=document.getElementById('profile-overlay');
  if(el) el.classList.add('hidden');
}

function skipProfile(){
  Profile.updateProfile({ name: Profile.get().name || '' });
  applyProfileToUI();
  closeProfile();
}

function saveProfile(){
  const nameEl=document.getElementById('profile-name');
  const countryEl=document.getElementById('profile-country');
  Profile.updateProfile({
    name: nameEl?nameEl.value:'',
    avatar: _selectedAvatar,
    country: countryEl?countryEl.value:'CM'
  });
  applyProfileToUI();
  closeProfile();
  toast('Profil enregistré','success');
  snd('click');
}

function openHistory(){
  const p=Profile.get();
  const s=p.stats;
  const grid=document.getElementById('stats-grid');
  const rated=s.wins+s.losses+s.draws;
  const wr=Profile.winRate();
  const streakLbl=s.streak>0?s.streak+' victoires':s.streak<0?Math.abs(s.streak)+' défaites':'—';
  if(grid){
    const cells=[
      [p.elo,'ELO actuel'],
      [p.eloPeak,'Meilleur ELO'],
      [s.wins+' – '+s.losses+' – '+s.draws,'V – D – N'],
      [(rated?wr+' %':'—'),'Taux de victoire'],
      [s.games,'Parties jouées'],
      [s.bestStreak||'—','Meilleure série']
    ];
    grid.innerHTML=cells.map(c=>'<div class="stat-card"><div class="stat-val">'+c[0]+'</div><div class="stat-lbl">'+c[1]+'</div></div>').join('');
  }
  const aiBox=document.getElementById('ai-stats');
  if(aiBox){
    aiBox.innerHTML=[1,2,3,4].map(d=>{
      const opp=Profile.aiOpponent(d);
      const b=s.byAi[d];
      return '<div class="ai-stats-row"><span>'+opp.avatar+' '+Profile.esc(opp.name)+' · '+opp.title+'</span><span>'+b.w+'V – '+b.l+'D – '+b.d+'N</span></div>';
    }).join('')+'<div class="ai-stats-row"><span>🌐 En ligne</span><span>'+s.online.w+'V – '+s.online.l+'D – '+s.online.d+'N</span></div>'
     +'<div class="ai-stats-row"><span>👥 Local (non classé)</span><span>'+s.local.games+' parties</span></div>'
     +'<div class="ai-stats-row"><span>Série en cours</span><span>'+streakLbl+'</span></div>';
  }
  const list=document.getElementById('match-list');
  const empty=document.getElementById('match-empty');
  if(list){
    list.innerHTML='';
    p.matches.forEach(m=>{
      const card=document.createElement('div');
      card.className='match-card '+m.result;
      const delta=m.rated?('<div class="match-elo-d '+(m.eloDelta>0?'up':m.eloDelta<0?'down':'flat')+'">'+(m.eloDelta>0?'+':'')+m.eloDelta+'</div>'):'';
      card.innerHTML=
        '<div class="match-players">'
        +'<div class="match-player">'+Profile.esc(Profile.displayName())+'</div>'
        +'<div class="match-vs">vs</div>'
        +'<div class="match-player">'+Profile.esc(m.oppName)+'</div>'
        +'</div>'
        +'<div class="match-result"><div class="match-score">'+m.yourScore+' – '+m.oppScore+'</div>'
        +'<div class="match-outcome">'+Profile.outcomeLabel(m.result)+'</div></div>'
        +'<div class="match-meta"><div class="match-mode">'+Profile.modeLabel(m.mode,m.aiDiff)
        +(m.timeControl&&m.timeControl!=='∞'?' · '+m.timeControl:'')+'</div>'
        +'<div class="match-date">'+Profile.formatRelative(m.ts)+'</div>'+delta+'</div>';
      list.appendChild(card);
    });
  }
  if(empty) empty.style.display=p.matches.length?'none':'block';
  renderLeaderboard(null);
  document.getElementById('history-overlay').classList.remove('hidden');
  Profile.fetchLeaderboard().then(renderLeaderboard);
}

function renderLeaderboard(board){
  const box=document.getElementById('leaderboard-list');
  if(!box) return;
  if(!board){
    box.innerHTML='<p class="profile-intro">Chargement du classement…</p>';
    return;
  }
  const list=board.list||[];
  const me=board.me;
  if(!list.length){
    box.innerHTML='<p class="profile-intro">Le classement se remplit après les premières parties enregistrées sur le serveur.</p>';
    return;
  }
  box.innerHTML=list.map(r=>{
    const you=me&&r.id===me.id;
    return '<div class="leaderboard-row'+(you?' me':'')+'">'
      +'<span class="lb-rank">'+(r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':r.rank)+'</span>'
      +'<span class="lb-av">'+r.avatar+'</span>'
      +'<span class="lb-name">'+Profile.esc(r.name)+' '+(r.flag||'')+(you?' <em>vous</em>':'')+'</span>'
      +'<span class="lb-wr">'+r.winRate+'%</span>'
      +'<span class="lb-elo">'+r.elo+'</span>'
      +'</div>';
  }).join('');
}

function closeHistory(){
  const el=document.getElementById('history-overlay');
  if(el) el.classList.add('hidden');
}

window.openProfile=openProfile;
window.closeProfile=closeProfile;
window.saveProfile=saveProfile;
window.skipProfile=skipProfile;
window.openHistory=openHistory;
window.closeHistory=closeHistory;
window.respondDraw=respondDraw;

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

/* ══════════════════════════════════════════════════════════════
   WELCOME ONBOARDING SCREEN (New Players)
   ══════════════════════════════════════════════════════════════ */
let wlcState = {
  step: 1,
  avatar: '👤',
  name: '',
  country: 'CM'
};

function initWelcomeScreen() {
  const p = (window.Profile && Profile.get()) || { avatar: '👤', name: '', country: 'CM' };
  wlcState.avatar = p.avatar || '👤';
  wlcState.name = p.name || '';
  wlcState.country = p.country || 'CM';

  // Populate avatar grid
  const grid = document.getElementById('wlc-avatar-grid');
  if (grid && window.Profile && Profile.AVATARS) {
    grid.innerHTML = '';
    Profile.AVATARS.forEach(av => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wlc-av-btn' + (av === wlcState.avatar ? ' selected' : '');
      btn.textContent = av;
      btn.setAttribute('aria-label', `Choisir l'avatar ${av}`);
      btn.onclick = () => {
        wlcState.avatar = av;
        grid.querySelectorAll('.wlc-av-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        updateWelcomePreview();
      };
      grid.appendChild(btn);
    });
  }

  // Populate country select
  const countrySel = document.getElementById('wlc-country');
  if (countrySel && window.Profile && Profile.COUNTRIES) {
    countrySel.innerHTML = '';
    Profile.COUNTRIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.emoji + '  ' + c.name;
      if (c.code === wlcState.country) opt.selected = true;
      countrySel.appendChild(opt);
    });
    countrySel.onchange = () => {
      wlcState.country = countrySel.value;
      updateWelcomePreview();
    };
  }

  // Setup name input
  const nameInput = document.getElementById('wlc-name');
  if (nameInput) {
    nameInput.value = wlcState.name;
    nameInput.oninput = () => {
      wlcState.name = nameInput.value.slice(0, 16);
      updateWelcomePreview();
    };
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        wlcNext(2);
      }
    };
  }

  updateWelcomePreview();
  wlcSetStep(1);
}

function updateWelcomePreview() {
  const avEl = document.getElementById('wlc-preview-av');
  const nameEl = document.getElementById('wlc-preview-name');
  const flagEl = document.getElementById('wlc-preview-flag');

  const c = window.Profile && Profile.COUNTRIES ? Profile.COUNTRIES.find(x => x.code === wlcState.country) : null;
  const flag = c ? c.emoji : '🌍';
  const displayName = (wlcState.name && wlcState.name.trim()) ? wlcState.name.trim() : 'Votre nom';

  if (avEl) avEl.textContent = wlcState.avatar || '👤';
  if (nameEl) nameEl.textContent = displayName;
  if (flagEl) flagEl.textContent = flag;
}

function wlcSetStep(step) {
  wlcState.step = step;

  // Update dots
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`wlc-dot-${i}`);
    if (dot) dot.classList.toggle('active', i === step);
  }

  // Update panes
  for (let i = 1; i <= 3; i++) {
    const pane = document.getElementById(`wlc-step-${i}`);
    if (pane) {
      if (i === step) {
        pane.classList.remove('hidden');
        pane.classList.add('wlc-pane-enter');
        setTimeout(() => pane.classList.remove('wlc-pane-enter'), 400);
      } else {
        pane.classList.add('hidden');
        pane.classList.remove('wlc-pane-enter');
      }
    }
  }

  if (step === 2) {
    const nameInput = document.getElementById('wlc-name');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  } else if (step === 3) {
    updateWelcomePreview();
  }
}

function wlcNext(fromStep) {
  if (typeof snd === 'function') snd('click');
  if (fromStep === 1) {
    wlcSetStep(2);
  } else if (fromStep === 2) {
    const nameInput = document.getElementById('wlc-name');
    if (nameInput) {
      wlcState.name = nameInput.value.trim();
    }
    updateWelcomePreview();
    wlcSetStep(3);
  }
}

function wlcPrev(fromStep) {
  if (typeof snd === 'function') snd('click');
  if (fromStep === 2) {
    wlcSetStep(1);
  } else if (fromStep === 3) {
    wlcSetStep(2);
  }
}

function wlcFinish() {
  if (typeof snd === 'function') snd('game_start');
  const nameInput = document.getElementById('wlc-name');
  const finalName = (nameInput && nameInput.value.trim()) || (wlcState.name && wlcState.name.trim()) || 'Joueur';
  const countrySel = document.getElementById('wlc-country');
  const finalCountry = (countrySel && countrySel.value) || wlcState.country || 'CM';
  const finalAvatar = wlcState.avatar || '👤';

  // Save profile and mark setupDone = true
  if (window.Profile) {
    Profile.updateProfile({
      name: finalName,
      avatar: finalAvatar,
      country: finalCountry
    });
  }

  applyProfileToUI();
  if (socket && socket.connected && window.Profile && Profile.token()) {
    socket.emit('identify', Profile.token());
  }

  const welcomeScreen = document.getElementById('welcome-screen');
  const menuScreen = document.getElementById('menu');

  if (welcomeScreen) {
    welcomeScreen.classList.add('wlc-exit');
    setTimeout(() => {
      document.documentElement.classList.remove('is-new-player');
      welcomeScreen.classList.add('hidden');
      welcomeScreen.classList.remove('wlc-exit');

      if (window.Router) {
        Router.navigate('/home');
      } else {
        viewHome();
      }

      if (typeof toast === 'function') {
        const dName = window.Profile ? Profile.displayName() : finalName;
        toast(`Bienvenue sur Songo, ${dName} ! 🎮`, 'success');
      }
    }, 450);
  } else {
    document.documentElement.classList.remove('is-new-player');
    if (window.Router) {
      Router.navigate('/home');
    } else {
      viewHome();
    }
  }
}

window.wlcNext = wlcNext;
window.wlcPrev = wlcPrev;
window.wlcFinish = wlcFinish;
window.initWelcomeScreen = initWelcomeScreen;

/* ══════════════════════════════════════════════════════════════
   ROUTER VIEWS & ROUTE HANDLERS
   ══════════════════════════════════════════════════════════════ */
function viewWelcome() {
  document.documentElement.classList.add('is-new-player');
  const wlc = document.getElementById('welcome-screen');
  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  const aiSetup = document.getElementById('ai-setup');
  if (wlc) wlc.classList.remove('hidden');
  if (menu) menu.classList.add('hidden');
  if (game) game.classList.add('hidden');
  if (lobby) lobby.classList.add('hidden');
  if (aiSetup) aiSetup.classList.add('hidden');
  initWelcomeScreen();
  document.title = 'Songo — Bienvenue';
}

function viewHome() {
  document.documentElement.classList.remove('is-new-player');
  const wlc = document.getElementById('welcome-screen');
  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  const aiSetup = document.getElementById('ai-setup');
  if (wlc) wlc.classList.add('hidden');
  if (menu) menu.classList.remove('hidden');
  if (game) game.classList.add('hidden');
  if (lobby) lobby.classList.add('hidden');
  if (aiSetup) aiSetup.classList.add('hidden');
  applyProfileToUI();
  document.title = 'Songo — Mancala Camerounais | Édition Premium';
}

function viewLobby() {
  document.documentElement.classList.remove('is-new-player');
  const wlc = document.getElementById('welcome-screen');
  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  const aiSetup = document.getElementById('ai-setup');
  if (wlc) wlc.classList.add('hidden');
  if (menu) menu.classList.add('hidden');
  if (game) game.classList.add('hidden');
  if (aiSetup) aiSetup.classList.add('hidden');
  if (lobby) {
    lobby.classList.remove('hidden');
    document.getElementById('lobby-create').classList.remove('hidden');
    document.getElementById('lobby-waiting').classList.add('hidden');
    document.getElementById('lobby-join').classList.remove('hidden');
    document.getElementById('lobby-err').textContent = '';
    document.getElementById('join-code').value = '';
  }
  getSocket();
  document.title = 'Songo — Salon Multijoueur';
}

function viewGame() {
  document.documentElement.classList.remove('is-new-player');
  const wlc = document.getElementById('welcome-screen');
  const menu = document.getElementById('menu');
  const game = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  const aiSetup = document.getElementById('ai-setup');
  if (wlc) wlc.classList.add('hidden');
  if (menu) menu.classList.add('hidden');
  if (lobby) lobby.classList.add('hidden');
  if (aiSetup) aiSetup.classList.add('hidden');
  if (game) game.classList.remove('hidden');
  document.title = 'Songo — Partie en cours';
}

function initRouter() {
  if (!window.Router) return;
  Router.register('/welcome', viewWelcome);
  Router.register('/home', viewHome);
  Router.register('/', viewHome);
  Router.register('/lobby', viewLobby);
  Router.register('/game', viewGame);
  Router.init();
}

window.viewWelcome = viewWelcome;
window.viewHome = viewHome;
window.viewLobby = viewLobby;
window.viewGame = viewGame;
window.initRouter = initRouter;

// Restore theme + profile on load
(function(){
  const saved=localStorage.getItem('songo_theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);
  document.addEventListener('DOMContentLoaded',()=>{
    applyProfileToUI();
    fillAiOpponents();

    // Start router (guards and dispatches to /welcome for new players or /home for returning)
    initRouter();

    if (window.Profile) {
      Profile.ensureSession().then(()=>{
        applyProfileToUI();
        if(socket&&socket.connected&&Profile.token()) socket.emit('identify', Profile.token());
      }).catch(()=>{});
    }
  });
})();

/* ══════════════════════════════════════════════════════════════
   KEYBOARD NAVIGATION
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape'){
    closeSettings();
    closeProfile();
    closeHistory();
    const resignBox=document.getElementById('resign-confirm');
    if(resignBox)resignBox.remove();
    const drawBox=document.getElementById('draw-confirm');
    if(drawBox)drawBox.remove();
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