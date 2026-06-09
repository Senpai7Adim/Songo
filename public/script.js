//IFOU FOPA ANGE MIGUEL
const P1S=6,P2S=13,P1=[0,1,2,3,4,5],P2=[7,8,9,10,11,12];
const C1='#F5D08A',C2='#88BBFF',CG='#80EE80';
let B=[],turn=1,over=false,busy=false,diff=1,actx;
let mode='ai',myPlayer=1,socket=null,roomCode=null,pendingState=null,pendingMove=null,lastMoveSeq=-1;
let gamePaused=false,pauseTimer=null;

function init(){B=Array(14).fill(4);B[P1S]=0;B[P2S]=0}
function opp(i){return 12-i}
function nx(i,p){let n=(i+1)%14;if(p===1&&n===P2S)n=0;if(p===2&&n===P1S)n=7;return n}
function own(i,p){return p===1?P1.includes(i):P2.includes(i)}
function gs(p){return p===1?P1S:P2S}
function wt(ms){return new Promise(r=>setTimeout(r,ms))}

function flipped(){return mode==='online'&&myPlayer===2}
function gEl(idx){
  if(flipped()){
    if(idx===P2S)return document.getElementById('styo');
    if(idx===P1S)return document.getElementById('stai');
    if(idx>=7&&idx<=12)return document.getElementById('ryo').children[idx-7];
    if(idx>=0&&idx<=5)return document.getElementById('rai').children[idx];
    return null;
  }
  if(idx===P1S)return document.getElementById('styo');
  if(idx===P2S)return document.getElementById('stai');
  if(idx>=0&&idx<=5)return document.getElementById('ryo').children[idx];
  if(idx>=7&&idx<=12)return document.getElementById('rai').children[12-idx];
  return null;
}
function gCtr(idx){
  const el=gEl(idx);if(!el)return null;
  const wr=document.getElementById('bwrap').getBoundingClientRect();
  const er=el.getBoundingClientRect();
  return{x:er.left-wr.left+er.width/2,y:er.top-wr.top+er.height/2};
}
function mkD(n,col){
  if(n===0)return'<span class="pval z">0</span>';
  if(n>13)return'<span class="pval">'+n+'</span>';
  const cols=n===1?1:n<=4?2:3,sm=n>9?' sm':'';
  let h='<div class="dg" style="grid-template-columns:repeat('+cols+',var(--seed-sz))">';
  for(let i=0;i<n;i++)h+='<div class="d'+sm+'" style="background:'+col+'"></div>';
  return h+'</div>';
}
function bindPit(d,idx,p){
  d.onclick=(e)=>{e.preventDefault();click(idx)};
  d.onmouseenter=()=>{if(!busy)shPath(idx,p)};
  d.onmouseleave=clrH;
  d.addEventListener('touchstart',(e)=>{if(!busy){shPath(idx,p)}},{passive:true});
  d.addEventListener('touchend',()=>setTimeout(clrH,400),{passive:true});
}
function pitCol(idx){return(flipped()?(P2.includes(idx)?C2:C1):(idx<=5?C1:C2))}
function uc(idx){
  if(idx===P1S||idx===P2S){
    const mine=flipped()?P2S:P1S,opp=flipped()?P1S:P2S;
    document.getElementById('svyo').textContent=B[mine];
    document.getElementById('svai').textContent=B[opp];
    const scY=document.getElementById('scyo'),scA=document.getElementById('scai');
    scY.textContent=B[mine];scA.textContent=B[opp];
    ta(scY,'scb');ta(scA,'scb');return;
  }
  const el=gEl(idx);
  if(el&&el.classList.contains('pit')){
    const c=pitCol(idx);
    const lbl=(mode!=='ai'&&((flipped()&&P2.includes(idx))||(!flipped()&&idx<=5)))?'<span class="plb">'+(P2.includes(idx)?idx-6:idx+1)+'</span>':'';
    el.innerHTML=mkD(B[idx],c)+lbl;
  }
}
function ta(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);el.addEventListener('animationend',()=>el.classList.remove(cls),{once:true})}
function fl(el,txt,col){if(!el)return;const l=document.createElement('span');l.className='flb';l.style.color=col;l.textContent=txt;el.appendChild(l);setTimeout(()=>l.remove(),620)}
async function fly(fi,ti,col){
  const f=gCtr(fi),t=gCtr(ti);if(!f||!t)return;
  const w=document.getElementById('bwrap'),s=document.createElement('div');
  s.className='fseed';s.style.background=col;s.style.boxShadow='0 0 5px '+col+'AA';
  s.style.left=f.x+'px';s.style.top=f.y+'px';w.appendChild(s);
  await wt(15);s.style.left=t.x+'px';s.style.top=t.y+'px';await wt(175);s.style.opacity='0';await wt(80);s.remove();
}
function getPath(pi,p){let s=B[pi],c=pi;const path={};while(s--){c=nx(c,p);path[c]=(path[c]||0)+1;}return path}
function shPath(pi,p){
  clrH();if(pi===null||!B[pi])return;
  const path=getPath(pi,p),keys=Object.keys(path).map(Number),last=keys[keys.length-1];
  const isP2=p===2;
  keys.forEach(k=>{const el=gEl(k);if(el&&el.classList.contains('pit'))el.classList.add(k===last?(isP2?'hl2':'hl'):(isP2?'hp2':'hp'));});
}
function clrH(){document.querySelectorAll('.hp,.hl,.hp2,.hl2').forEach(e=>e.classList.remove('hp','hl','hp2','hl2'))}

function snd(t){
  try{
    if(!actx)actx=new(window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume();
    const mk=(f,ts,ty,v,d)=>{const o=actx.createOscillator(),g=actx.createGain();o.connect(g);g.connect(actx.destination);o.frequency.value=f;o.type=ty;g.gain.setValueAtTime(v,ts);g.gain.exponentialRampToValueAtTime(0.001,ts+d);o.start(ts);o.stop(ts+d+0.01)};
    const n=actx.currentTime;
    if(t==='dp')mk(260,n,'triangle',0.1,0.07);
    else if(t==='cp'){mk(440,n,'sine',0.16,0.12);mk(660,n+0.11,'sine',0.16,0.18)}
    else if(t==='ex')mk(880,n,'sine',0.12,0.22);
    else if(t==='win'){[523,659,784,1047].forEach((f,i)=>mk(f,n+i*0.13,'sine',0.16,0.26))}
    else if(t==='ls'){[380,320,260].forEach((f,i)=>mk(f,n+i*0.13,'triangle',0.1,0.22))}
  }catch(e){}
}

function apM(b,pi,p){
  let s=b[pi];if(!s)return{ok:false};
  b[pi]=0;let c=pi;while(s--){c=nx(c,p);b[c]++;}
  const ex=c===gs(p);
  if(!ex&&own(c,p)&&b[c]===1){const o=opp(c);if(b[o]>0){b[gs(p)]+=b[o]+1;b[c]=0;b[o]=0;}}
  return{ok:true,ex};
}

function aiEz(){const m=P2.filter(i=>B[i]>0);return m.length?m[Math.floor(Math.random()*m.length)]:null}
function scB(b){return b[P2S]-b[P1S]+P2.reduce((a,i)=>a+b[i]*0.08,0)}
function aiMd(){const mv=P2.filter(i=>B[i]>0);if(!mv.length)return null;let best=null,bs=-Infinity;mv.forEach(m=>{let t=[...B];const r=apM(t,m,2);let s=scB(t);if(r.ex)s+=6;if(s>bs){bs=s;best=m}});return best}
function aiHd(){
  const mv=P2.filter(i=>B[i]>0);if(!mv.length)return null;let best=null,bs=-Infinity;
  mv.forEach(m=>{let t=[...B];const r=apM(t,m,2);let s=scB(t);
    if(r.ex){const m2=P2.filter(i=>t[i]>0);if(m2.length){let b2=-Infinity;m2.forEach(mm=>{let t2=[...t];apM(t2,mm,2);b2=Math.max(b2,scB(t2))});s+=b2*0.55}}
    else{const om=P1.filter(i=>t[i]>0);if(om.length){let w=Infinity;om.forEach(mm=>{let t2=[...t];apM(t2,mm,1);w=Math.min(w,scB(t2))});s=s*0.5+w*0.5}}
    if(s>bs){bs=s;best=m}});
  return best;
}
function aip(){return diff===1?aiEz():diff===2?aiMd():aiHd()}

function pName(p){if(mode==='ai')return p===1?'Vous':'Ordinateur';if(mode==='local')return'Joueur '+p;return p===myPlayer?'Vous':'Adversaire'}
function activePlayer(){return turn}
function canPlay(p){if(over||busy||gamePaused)return false;if(mode==='ai')return p===1&&turn===1;if(mode==='local')return turn===p;if(mode==='online')return turn===p&&p===myPlayer;return false}

async function animM(pi,p,opts){
  const skipBusy=opts&&opts.skipBusy;
  const seeds=opts&&opts.seeds!==undefined?opts.seeds:B[pi];
  if(!seeds){if(!skipBusy)busy=false;return{ex:false,cap:false}}
  if(!skipBusy)busy=true;
  const spd=seeds<=6?215:seeds<=12?170:seeds<=20?130:90;
  const col=p===1?C1:C2,rc=p===1?'ar':'ara';
  setInf('<span class="sd" style="background:'+col+'"></span> <b>'+seeds+'</b> graine'+(seeds>1?'s':'')+'…');
  const se=gEl(pi);if(se)se.classList.add(p===1?'sp':'sa');
  ta(se,'adp');B[pi]=0;uc(pi);snd('dp');await wt(spd*0.6);
  if(se)se.classList.remove('sp','sa');
  let cur=pi;
  for(let i=0;i<seeds;i++){
    const prev=cur;cur=nx(cur,p);B[cur]++;
    fly(prev,cur,col);await wt(spd*0.42);
    const el=gEl(cur);ta(el,rc);fl(el,'+1',col);
    if(i%Math.max(1,Math.floor(seeds/8))===0)snd('dp');
    uc(cur);await wt(spd*0.58);
  }
  const ex=cur===gs(p);let cap=false;
  if(ex){const se2=gEl(gs(p));ta(se2,p===1?'asg':'asb');fl(se2,'✨',col);snd('ex');setInf('<span class="sd" style="background:'+col+'"></span> ✨ Tour supplémentaire !');await wt(420)}
  if(!ex&&own(cur,p)&&B[cur]===1){
    const o=opp(cur);
    if(B[o]>0){cap=true;const cpt=B[o]+1;setInf('<span class="sd" style="background:'+CG+'"></span> Capture de <b>'+cpt+'</b> graines !');
      await wt(160);ta(gEl(cur),'acp');ta(gEl(o),'acp');snd('cp');await wt(380);
      B[gs(p)]+=cpt;B[cur]=0;B[o]=0;uc(cur);uc(o);uc(gs(p));
      const st2=gEl(gs(p));ta(st2,'asn');fl(st2,'+'+cpt,CG);await wt(300);}
  }
  return{ex,cap};
}

async function click(idx){
  const p=own(idx,1)?1:2;
  if(!canPlay(p))return;
  if(!own(idx,p)||!B[idx])return;
  clrH();

  if(mode==='online'){
    const s=getSocket();
    if(!s.connected){setInf('Non connecté au serveur');return;}
    if(busy)return;
    s.emit('move',Number(idx),res=>{
      if(!res||!res.ok){setInf(res&&res.error?res.error:'Coup invalide');rend();return;}
      if(res.move)handleOnlineMove(res.move);
    });
    return;
  }

  busy=true;rend(false);

  const r=await animM(idx,p,{});
  chkEnd();if(over){busy=false;return;}
  if(r.ex){turn=p;busy=false;rend();setInf('<span style="color:'+(p===1?C1:C2)+'">▶</span> '+pName(p)+' rejoue !')}
  else if(mode==='ai'&&p===1){turn=2;rend(false);setInf('<span class="td"></span><span class="td"></span><span class="td"></span>');await wt(diff===1?380:diff===2?600:850);await runAI()}
  else{turn=p===1?2:1;busy=false;rend();setTurnInf()}
}

async function runAI(){
  if(over||mode!=='ai')return;
  const m=aip();if(m===null){turn=1;busy=false;rend();setInf('<span style="color:'+C1+'">▶</span> À vous de jouer !');return}
  const se=gEl(m);if(se)se.classList.add('sa');
  setInf('<span class="sd" style="background:'+C2+'"></span> Fosse n°'+(m-6)+' — '+B[m]+' graine'+(B[m]>1?'s':'')+'');
  await wt(380);
  const r=await animM(m,2,{});
  chkEnd();if(over){busy=false;return;}
  if(r.ex){setInf('<span style="color:'+C2+'">▶</span> L\'ordi rejoue…');await wt(diff===1?280:diff===2?450:680);await runAI()}
  else{turn=1;busy=false;rend();setInf('<span style="color:'+C1+'">▶</span> À vous de jouer !')}
}

function chkEnd(scores){
  const s1=P1.reduce((a,i)=>a+B[i],0),s2=P2.reduce((a,i)=>a+B[i],0);
  if(!s1||!s2){
    if(!scores){P1.forEach(i=>{B[P1S]+=B[i];B[i]=0});P2.forEach(i=>{B[P2S]+=B[i];B[i]=0})}
    over=true;rendAll();
    const y=B[P1S],a=B[P2S];let msg;
    if(mode==='ai'){
      if(y>a){msg='🎉 Vous gagnez ! ('+y+' vs '+a+')';snd('win');cftti()}
      else if(a>y){msg='🤖 Ordinateur gagne ('+a+' vs '+y+')';snd('ls')}
      else msg='🤝 Égalité ! ('+y+' graines)';
    }else if(mode==='local'){
      if(y>a){msg='🎉 Joueur 1 gagne ! ('+y+' vs '+a+')';snd('win');cftti()}
      else if(a>y){msg='🎉 Joueur 2 gagne ! ('+a+' vs '+y+')';snd('win');cftti()}
      else msg='🤝 Égalité ! ('+y+' graines)';
    }else{
      const mine=myPlayer===1?y:a,theirs=myPlayer===1?a:y;
      if(mine>theirs){msg='🎉 Vous gagnez ! ('+mine+' vs '+theirs+')';snd('win');cftti()}
      else if(theirs>mine){msg='😔 Adversaire gagne ('+theirs+' vs '+mine+')';snd('ls')}
      else msg='🤝 Égalité ! ('+mine+' graines)';
    }
    document.getElementById('em').textContent=msg;document.getElementById('em').style.display='block';
    setInf('Partie terminée');
  }
}

function cftti(){
  const w=document.getElementById('bwrap'),cs=['#F5D08A','#FF8844','#80EE80','#88BBFF','#FF88CC'];
  for(let i=0;i<40;i++)setTimeout(()=>{const p=document.createElement('div'),c=cs[Math.floor(Math.random()*cs.length)],sz=Math.random()*8+3;
    p.style.cssText='position:absolute;width:'+sz+'px;height:'+(sz*.45)+'px;background:'+c+';border-radius:2px;left:'+(Math.random()*100)+'%;top:5px;pointer-events:none;z-index:100;animation:cfti '+(Math.random()*1.1+0.9)+'s ease-out '+(Math.random()*0.35)+'s forwards;';
    w.appendChild(p);setTimeout(()=>p.remove(),2600)},i*38);
}

function setInf(h){document.getElementById('inf').innerHTML=h}
function updateLabels(){
  if(mode==='ai'){
    document.getElementById('lb-yo').textContent='Vous';document.getElementById('lb-ai').textContent='Ordinateur';
    document.getElementById('slb-yo').textContent='VOUS';document.getElementById('slb-ai').textContent='ORDI';
    document.getElementById('legend').innerHTML='<span><span class="ld" style="background:#F5D08A"></span>Vos graines</span><span><span class="ld" style="background:#88BBFF"></span>Ordi</span><span><span class="ld" style="background:#80EE80"></span>Capture</span><span><span class="ld" style="background:#FFB830"></span>Tour bonus</span>';
  }else if(mode==='local'){
    document.getElementById('lb-yo').textContent='Joueur 1';document.getElementById('lb-ai').textContent='Joueur 2';
    document.getElementById('slb-yo').textContent='J1';document.getElementById('slb-ai').textContent='J2';
    document.getElementById('legend').innerHTML='<span><span class="ld" style="background:#F5D08A"></span>J1 (bas)</span><span><span class="ld" style="background:#88BBFF"></span>J2 (haut)</span><span><span class="ld" style="background:#80EE80"></span>Capture</span><span><span class="ld" style="background:#FFB830"></span>Tour bonus</span>';
  }else{
    document.getElementById('lb-yo').textContent='Vous';
    document.getElementById('lb-ai').textContent='Adversaire';
    document.getElementById('slb-yo').textContent='VOUS';
    document.getElementById('slb-ai').textContent='ADV';
    const mine=myPlayer===2?'#88BBFF':'#F5D08A',adv=myPlayer===2?'#F5D08A':'#88BBFF';
    document.getElementById('legend').innerHTML='<span><span class="ld" style="background:'+adv+'"></span>Adversaire (haut)</span><span><span class="ld" style="background:'+mine+'"></span>Vos fosses (bas)</span><span><span class="ld" style="background:#80EE80"></span>Capture</span><span><span class="ld" style="background:#FFB830"></span>Tour bonus</span>';
  }
}

function rendHdr(){
  const ap=activePlayer();
  if(mode==='online'){
    const me=myPlayer,myCls=me===2?' ap2':' ap1',oppCls=me===2?' ap1':' ap2';
    document.getElementById('cyo').className='pcard'+(ap===me&&!over?myCls:'');
    document.getElementById('cai').className='pcard'+(ap!==me&&!over?oppCls:'');
  }else{
    document.getElementById('cyo').className='pcard'+(ap===1&&!over?' ap1':'');
    document.getElementById('cai').className='pcard'+(ap===2&&!over?' ap2':'');
  }
}

function rend(refreshPits){
  if(refreshPits!==false)rendAll();
  rendHdr();
}

function addPit(row,idx,player,label){
  const d=document.createElement('div');d.className='pit';
  const ok=canPlay(player)&&B[idx]>0;
  const col=player===1?C1:C2;
  d.innerHTML=mkD(B[idx],col)+(label?'<span class="plb">'+label+'</span>':'');
  if(ok){d.classList.add(player===1?'can':'can2');bindPit(d,idx,player)}
  row.appendChild(d);
}

function rendAll(){
  const mine=flipped()?P2S:P1S,opp=flipped()?P1S:P2S;
  document.getElementById('svyo').textContent=B[mine];
  document.getElementById('svai').textContent=B[opp];
  document.getElementById('scyo').textContent=B[mine];
  document.getElementById('scai').textContent=B[opp];
  const ry=document.getElementById('ryo');ry.innerHTML='';
  const ra=document.getElementById('rai');ra.innerHTML='';
  if(flipped()){
    P2.forEach((idx,i)=>addPit(ry,idx,2,String(i+1)));
    P1.forEach((idx,i)=>addPit(ra,idx,1,String(i+1)));
  }else{
    P1.forEach((idx,i)=>addPit(ry,idx,1,String(i+1)));
    for(let i=12;i>=7;i--)addPit(ra,i,2,null);
  }
}

function sd(d,btn){diff=d;document.querySelectorAll('.db').forEach(b=>b.classList.remove('on'));btn.classList.add('on')}
function tr(){
  const rp=document.getElementById('rp');
  if(!rp.classList.contains('show'))loadRules();
  rp.classList.toggle('show');
}
function loadRules(){
  const rp=document.getElementById('rp');
  if(rp.innerHTML.trim()!==''&&!rp.innerHTML.includes('Chargement'))return;
  rp.innerHTML='<em>Chargement des règles...</em>';
  const x=new XMLHttpRequest();
  x.onreadystatechange=function(){
    if(this.readyState==4&&this.status==200)rp.innerHTML=this.responseText;
    else if(this.readyState==4)rp.innerHTML='<b>Erreur de chargement.</b>';
  };
  x.open('GET','rules.txt',true);
  x.send();
}

function ng(){
  if(mode==='online'&&socket&&roomCode){lastMoveSeq=-1;socket.emit('rematch');return}
  init();turn=1;over=false;busy=false;lastMoveSeq=-1;
  document.getElementById('em').style.display='none';document.getElementById('em').textContent='';
  clrH();rend();
  setTurnInf();
}

function showGame(){
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  document.getElementById('diff-row').style.display=mode==='ai'?'flex':'none';
  const tags={ai:'🤖 Solo vs Ordinateur',local:'👥 Local à 2 joueurs',online:'🌐 En ligne — salle '+roomCode};
  document.getElementById('mode-tag').textContent=tags[mode]||'';
  updateLabels();
  if(mode==='online'){
    document.getElementById('em').style.display='none';
    busy=false;
    if(B.length){rend();setTurnInf()}
  }else ng();
}

function updateConnStatus(msg){
  const el=document.getElementById('conn-status');
  if(!el)return;
  if(msg){el.textContent=msg;el.style.color='#e55';return}
  if(!socket){el.textContent='Non connecté';el.style.color='#e55';return}
  if(socket.connected){el.textContent='● Connecté au serveur';el.style.color='#4a4'}
  else{el.textContent='○ Reconnexion…';el.style.color='#c90'}
}

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
    socket.on('connect',()=>{updateConnStatus();if(roomCode&&myPlayer)rejoinOnline();});
    socket.on('disconnect',()=>updateConnStatus());
    socket.on('connect_error',()=>{
      updateConnStatus('Serveur inaccessible — lancez : npm start');
    });
    listenOnline();
  }
  updateConnStatus();
  return socket;
}

function startMode(m){
  mode=m;myPlayer=1;roomCode=null;
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
  document.getElementById('pause-title').textContent=isMe
    ?'Connexion perdue — reconnectez-vous'
    :'Adversaire déconnecté';
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
  tick();
  pauseTimer=setInterval(tick,500);
  rend();
}

function handleOpponentLeft(data){
  hidePauseBanner();clearSession();
  over=true;busy=false;pendingState=null;pendingMove=null;
  const reason=data&&data.reason;
  let msg;
  if(reason==='left')msg='L\'adversaire a quitté la partie.';
  else if(reason==='timeout')msg='L\'adversaire n\'est pas revenu à temps.';
  else msg='Adversaire déconnecté.';
  document.getElementById('em').textContent=msg;document.getElementById('em').style.display='block';
  setInf('Partie terminée');rend();
}

function backToMenu(){
  hidePauseBanner();clearSession();
  if(socket&&roomCode){socket.emit('leave');roomCode=null}
  document.getElementById('game').classList.add('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  over=true;busy=false;
}

function createRoom(){
  const s=getSocket();
  document.getElementById('lobby-err').textContent='';
  if(!s){document.getElementById('lobby-err').textContent='Serveur non disponible';return}
  if(!s.connected){document.getElementById('lobby-err').textContent='Connexion en cours…';s.once('connect',createRoom);return}
  s.emit('create',res=>{
    if(!res||!res.ok){document.getElementById('lobby-err').textContent='Erreur de création';return}
    myPlayer=1;roomCode=res.code;
    document.getElementById('lobby-create').classList.add('hidden');
    document.getElementById('lobby-waiting').classList.remove('hidden');
    document.getElementById('room-code').textContent=res.code;
    document.getElementById('share-url').textContent=location.origin;
    if(res.state)applyState(res.state);
    saveSession();
  });
}

function joinRoom(){
  const code=document.getElementById('join-code').value.trim().toUpperCase();
  if(code.length<4){document.getElementById('lobby-err').textContent='Entrez un code valide';return}
  const s=getSocket();
  document.getElementById('lobby-err').textContent='';
  if(!s){document.getElementById('lobby-err').textContent='Serveur non disponible';return}
  if(!s.connected){document.getElementById('lobby-err').textContent='Connexion en cours…';s.once('connect',joinRoom);return}
  s.emit('join',code,res=>{
    if(!res||!res.ok){document.getElementById('lobby-err').textContent=res.error||'Impossible de rejoindre';return}
    myPlayer=res.player;roomCode=res.code;
    if(res.state){lastMoveSeq=-1;applyState(res.state);updateLabels();showGame();saveSession();}
  });
}

function setTurnInf(){
  if(gamePaused)return;
  const me=mode==='online'?myPlayer:turn;
  const col=turn===1?C1:C2;
  if(mode==='local'&&turn===2)setInf('<span style="color:'+C2+'">▶</span> Joueur 2 — touchez les fosses <b>bleues en haut</b>');
  else if(mode==='local'&&turn===1)setInf('<span style="color:'+C1+'">▶</span> Joueur 1 — touchez les fosses <b>dorées en bas</b>');
  else if(turn===me)setInf('<span style="color:'+col+'">▶</span> À vous de jouer ! Touchez vos fosses en <b>bas</b>');
  else setInf('<span class="td"></span><span class="td"></span><span class="td"></span> Tour de l\'adversaire…');
}

function tryStartOnlineGame(st){
  if(mode!=='online'||!st||!st.players||!st.players[1]||!st.players[2])return false;
  if(!document.getElementById('game').classList.contains('hidden'))return false;
  applyState(st);
  updateLabels();
  showGame();
  return true;
}

function applyState(st){
  if(!st)return;
  B=(st.B||[]).slice();turn=st.turn||1;over=!!st.over;roomCode=st.code||roomCode;
  if(st.moveSeq!==undefined)lastMoveSeq=st.moveSeq;
  if(st.paused&&st.graceEndsAt)showPauseBanner(st.graceEndsAt,st.disconnectedSlot);
  else if(!st.paused)hidePauseBanner();
  if(!over){
    document.getElementById('em').style.display='none';
    document.getElementById('em').textContent='';
  }
  busy=false;
  rend();
  if(over&&st.scores){
    B[P1S]=st.scores.p1;B[P2S]=st.scores.p2;
    chkEnd(st.scores);
  }else if(!over)setTurnInf();
}

async function handleOnlineMove(mv){
  if(!mv||mv.seq===undefined||mv.seq<=lastMoveSeq)return;
  if(busy){pendingMove=mv;return;}
  lastMoveSeq=mv.seq;
  busy=true;
  try{
    rend(false);
    B[mv.pit]=mv.seeds;
    await animM(mv.pit,mv.player,{skipBusy:true,seeds:mv.seeds});
    if(mv.B)B=mv.B.slice();
    turn=mv.turn;
    over=!!mv.over;
    if(mv.over&&mv.scores){
      B[P1S]=mv.scores.p1;B[P2S]=mv.scores.p2;
      rendAll();
      chkEnd(mv.scores);
    }else{
      rend();
      setTurnInf();
    }
  }finally{
    busy=false;
    if(pendingMove){const pm=pendingMove;pendingMove=null;handleOnlineMove(pm);}
    else if(pendingState){const ps=pendingState;pendingState=null;applyState(ps);}
    else if(!over)rend();
  }
}

function saveSession(){
  if(mode==='online'&&roomCode&&myPlayer){
    sessionStorage.setItem('songo',JSON.stringify({code:roomCode,player:myPlayer}));
  }else sessionStorage.removeItem('songo');
}

function clearSession(){sessionStorage.removeItem('songo');}

function rejoinOnline(){
  if(mode!=='online'||!roomCode||!myPlayer)return;
  const s=getSocket();
  if(!s||!s.connected)return;
  s.emit('rejoin',roomCode,myPlayer,res=>{
    if(res&&res.ok&&res.state){
      applyState(res.state);
      updateLabels();
      saveSession();
      if(document.getElementById('game').classList.contains('hidden'))showGame();
    }else if(res&&!res.ok&&res.error){
      clearSession();
    }
  });
}

(function(){
  try{
    const raw=sessionStorage.getItem('songo');
    if(!raw)return;
    const s=JSON.parse(raw);
    if(s.code&&s.player){
      roomCode=s.code;myPlayer=s.player;mode='online';
      window.addEventListener('load',()=>getSocket());
    }
  }catch(e){clearSession();}
})();

function listenOnline(){
  if(!socket._songo){socket._songo=true;
    socket.on('state',st=>{
      if(!st)return;
      if(busy){pendingState=st;return;}
      if(tryStartOnlineGame(st))return;
      if(mode==='online')applyState(st);
    });
    socket.on('move',mv=>handleOnlineMove(mv));
    socket.on('player_disconnected',d=>{
      if(d&&d.graceEndsAt)showPauseBanner(d.graceEndsAt,d.slot);
      else gamePaused=true;rend();
    });
    socket.on('player_rejoined',()=>{
      hidePauseBanner();
      setInf('<span style="color:#4a4">●</span> Adversaire de retour — la partie reprend !');
      setTurnInf();
    });
    socket.on('opponent_left',data=>handleOpponentLeft(data));
  }
}
let resizeT;
window.addEventListener('resize',()=>{
  clearTimeout(resizeT);
  resizeT=setTimeout(()=>{
    const g=document.getElementById('game');
    if(g&&!g.classList.contains('hidden')&&!busy)rendAll();
  },200);
});
window.addEventListener('orientationchange',()=>setTimeout(()=>{
  const g=document.getElementById('game');
  if(g&&!g.classList.contains('hidden')&&!busy)rendAll();
},300));