/* Comanda da Feira · telas e funcionamento do sistema.
   As regras de negócio (troco, divisão de conta, fila, resumo do dia) ficam em regras.js;
   o acesso aos dados fica em banco.js (Firebase de verdade ou modo demonstração). */
import { brl, pad, sum, comoDevolver, fila, entSet, addTo, emptySum, addOrder, r2, cashOf, trocoOf, dividirConta } from "./regras.js";
import { iniciarBanco } from "./banco.js";

const DEFAULT_CFG={pastel:[],caldo:[],bebida:[],caldoSabores:[],capacity:15,lowAt:10};
let caldoSel=[],cartVisible=false;
let stock={};
const soldToday=f=>orders.reduce((a,o)=>a+(+((o.pastel||{})[f])||0),0);
/* restante = montados hoje − vendidos hoje; null quando o sabor não tem controle */
const remaining=f=>Object.prototype.hasOwnProperty.call(stock,f)?(+stock[f]||0)-soldToday(f):null;
const emptyCart=()=>({pastel:{},caldo:{},bebida:{}});
let cfg=DEFAULT_CFG, orders=[], allOrders=[], db=null, view="caixa", cart=emptyCart(), busy=false;
const normList=a=>Array.isArray(a)?a.map(x=>typeof x==="string"?{n:x,p:0,d:""}:{n:String(x&&x.n||"").trim(),p:+(x&&x.p)||0,d:String(x&&x.d||"").trim()}).filter(x=>x.n):[];
const priceOf=(kind,name)=>{if(kind==="caldo")name=String(name).split(" + ")[0];const it=(cfg[kind]||[]).find(x=>x.n===name);return it?it.p:0};
const cartTotal=c=>["pastel","caldo","bebida"].reduce((t,k)=>t+Object.entries(c[k]).reduce((a,[f,q])=>a+q*priceOf(k,f),0),0);
const $=s=>document.querySelector(s);
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const fmtItems=o=>Object.entries(o||{}).filter(([,q])=>q>0).map(([k,q])=>q+"× "+k.toLowerCase()).join(", ");
let deviceId=ls.get("cf.dev",null); if(!deviceId){deviceId="d"+Math.random().toString(36).slice(2,10);ls.set("cf.dev",deviceId)}
let caixa=ls.get("cf.caixa","Esquerda");
let pinnedView=ls.get("cf.preso",""),unpinning=false;

function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}

/* ---------- navegação ---------- */
const VIEWS=["caixa","fritura","bandeja","caldo","estoque","gerente","ajustes"];
function show(v){
  if(pinnedView&&v!==pinnedView)v=pinnedView;
  if(!VIEWS.includes(v))v="caixa"; if(v!==view&&view==="ajustes")cfgDirty=false; view=v; ls.set("cf.view",v);
  const locked=isLocked(v)||changingPin||unpinning;
  VIEWS.forEach(x=>{$("#v-"+x).hidden=locked||x!==v});
  $("#v-lock").hidden=!locked;
  $("#lockBar").hidden=locked||!PROTECTED.includes(v);
  if(locked&&!changingPin){pinEntry="";pinErr=""}
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
  if(SCREEN_VIEWS.includes(v))wake();else sleepScreen(); if(v==="gerente"&&!locked)loadReport(); render(); if(locked)renderLock(); renderChrome();
}

/* ---------- senha (Estoque, Gerente, Ajustes) ---------- */
/* Trava de tela: protege contra acesso casual nos aparelhos da barraca. */
const PROTECTED=["estoque","gerente","ajustes"];
const UNLOCK_MS=15*60*1000;
let pinDoc=null,pinLoaded=false,unlockedUntil=0,pinEntry="",pinFirst="",pinErr="",changingPin=false,changeStep=1,pinBusy=false;
document.querySelectorAll("#tabs button").forEach(b=>{if(PROTECTED.includes(b.dataset.v))b.insertAdjacentHTML("beforeend",'<svg class="lk" viewBox="0 0 24 24" aria-label="protegido"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="4" y="11" width="16" height="10" rx="2.5" fill="currentColor"/></svg>')});
let dbTried=false;
function isLocked(v){return PROTECTED.includes(v)&&Date.now()>=unlockedUntil}
function touchUnlock(){if(PROTECTED.includes(view)&&Date.now()<unlockedUntil)unlockedUntil=Date.now()+UNLOCK_MS}
async function hashPin(salt,pin){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("comanda-feira:"+salt+":"+pin));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function pinMode(){
  if(changingPin)return changeStep===1?"new1":"new2";
  if(!db)return dbTried?"offline":"loading"; if(!pinLoaded)return "loading";
  if(!pinDoc)return pinFirst?"new2":"new1";
  return "enter";
}
function renderLock(){
  const m=pinMode(),names={estoque:"Estoque",gerente:"Gerente",ajustes:"Ajustes"};
  $("#lkTitle").textContent=unpinning?"Destravar este aparelho":changingPin?"Trocar senha":(m==="new1"||m==="new2")?"Criar senha do gerente":`Senha para ${names[view]||"entrar"}`;
  const msg={offline:"Sem conexão. A senha precisa do sistema no ar.",loading:"Carregando…",
    enter:unpinning?"Digite a senha do gerente para liberar todas as abas neste aparelho.":"Digite a senha do gerente.",
    new1:changingPin?"Digite a nova senha, de 4 a 6 números.":"Ainda não tem senha. Escolha uma de 4 a 6 números para proteger Estoque, Gerente e Ajustes.",
    new2:"Digite a mesma senha de novo para confirmar."}[m];
  $("#lkMsg").textContent=pinErr||msg; $("#lkMsg").style.color=pinErr?"var(--warn)":"";
  const n=Math.max(4,pinEntry.length);
  const showPin=$("#lkEye").getAttribute("aria-pressed")==="true";
  $("#lkDots").classList.toggle("txt",showPin);
  $("#lkDots").innerHTML=showPin?(pinEntry?esc(pinEntry):'<span class="muted" style="font-size:16px;letter-spacing:0;font-family:var(--body);font-weight:600">digite a senha</span>'):Array.from({length:Math.min(6,n)},(_, i)=>`<span class="${i<pinEntry.length?"f":""}"></span>`).join("");
  $("#lkDots").setAttribute("aria-label",pinEntry.length+" números digitados");
  const off=m==="offline"||m==="loading"||pinBusy;
  document.querySelectorAll("#lkPad button").forEach(b=>b.disabled=off);
  $("#lkPad [data-d=ok]").textContent=m==="enter"?"Entrar":m==="new1"?"Continuar":"Salvar";
  $("#lkCancel").hidden=!changingPin&&!unpinning; $("#lkCancel").textContent=unpinning?"Cancelar, continuar preso":"Cancelar troca de senha";
}
function pinFail(text){pinErr=text;pinEntry="";const d=$("#lkDots");d.classList.remove("shake");void d.offsetWidth;d.classList.add("shake","err");setTimeout(()=>d.classList.remove("err"),900);renderLock()}
async function savePin(pin){
  const salt=Math.random().toString(36).slice(2,12);
  await db.doc("config/pin").set({salt,hash:await hashPin(salt,pin)});
}
async function submitPin(){
  const m=pinMode(),pin=pinEntry;
  if(m==="enter"){
    if(pin.length<4){pinFail("A senha tem pelo menos 4 números.");return}
    pinBusy=true;renderLock();
    let ok=false;try{ok=(await hashPin(pinDoc.salt,pin))===pinDoc.hash}catch(e){} pinBusy=false;
    if(ok){unlockedUntil=Date.now()+UNLOCK_MS;pinEntry="";pinErr="";if(unpinning)releasePin();show(view)}else pinFail("Senha errada. Tente de novo.");
    return;
  }
  if(m==="new1"){if(pin.length<4){pinFail("Use pelo menos 4 números.");return}pinFirst=pin;pinEntry="";pinErr="";if(changingPin)changeStep=2;renderLock();return}
  if(m==="new2"){
    if(pin!==pinFirst){pinFirst="";if(changingPin)changeStep=1;pinFail("As senhas não batem. Comece de novo.");return}
    pinBusy=true;renderLock();
    try{await savePin(pin);pinFirst="";pinEntry="";pinErr="";const was=changingPin;changingPin=false;changeStep=1;unlockedUntil=Date.now()+UNLOCK_MS;pinBusy=false;if(unpinning)releasePin();show(view);toast(was?"Senha trocada em todos os aparelhos.":"Senha criada. Ela vale para todos os aparelhos.")}
    catch(e){pinBusy=false;pinFirst="";if(changingPin)changeStep=1;pinFail("Não salvou. Confira a conexão e tente de novo.")}
  }
}
$("#lkPad").addEventListener("click",e=>{const b=e.target.closest("button");if(!b||b.disabled)return;const d=b.dataset.d;
  if(d==="del"){pinEntry=pinEntry.slice(0,-1);pinErr="";renderLock();return}
  if(d==="ok"){submitPin();return}
  if(pinEntry.length<6){pinEntry+=d;pinErr="";renderLock()}});
document.addEventListener("keydown",e=>{if($("#v-lock").hidden)return;
  if(/^[0-9]$/.test(e.key)&&pinEntry.length<6){pinEntry+=e.key;pinErr="";renderLock()}
  else if(e.key==="Backspace"){pinEntry=pinEntry.slice(0,-1);renderLock()}
  else if(e.key==="Enter"){e.preventDefault();submitPin()}});
$("#lkEye").addEventListener("click",()=>{const b=$("#lkEye"),on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",on);b.querySelector("span").textContent=on?"Esconder números":"Mostrar números";renderLock()});
$("#btnLockNow").addEventListener("click",()=>{unlockedUntil=0;show(view)});
$("#btnChangePin").addEventListener("click",()=>{if(!pinDoc)return;changingPin=true;changeStep=1;pinFirst="";pinEntry="";pinErr="";show(view)});
$("#lkCancel").addEventListener("click",()=>{unpinning=false;changingPin=false;changeStep=1;pinFirst="";pinEntry="";pinErr="";show(view)});
document.addEventListener("pointerdown",touchUnlock,{passive:true});
setInterval(()=>{if(PROTECTED.includes(view)&&!changingPin&&$("#v-lock").hidden&&isLocked(view))show(view)},20000);
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(changingPin){changingPin=false;changeStep=1;pinFirst=""}show(b.dataset.v)});
/* tela sempre acesa nos postos (fritura, bandeja e caldo) */
const SCREEN_VIEWS=["fritura","bandeja","caldo"];
let wl=null; async function wake(){try{if("wakeLock" in navigator&&!wl){wl=await navigator.wakeLock.request("screen");wl.addEventListener("release",()=>wl=null)}}catch(e){}}
function sleepScreen(){try{wl&&wl.release()}catch(e){}wl=null}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&SCREEN_VIEWS.includes(view))wake()});

/* ---------- aviso sonoro (só na Fritura) ---------- */
/* Toca a cada pedido novo que tenha pastel. */
const SOUND_VIEWS=["fritura"];
let somOn=ls.get("cf.som","1")==="1",somTipo=ls.get("cf.somTipo","sino"),actx=null,prevQ=null,alarmEl=null,alarmOk=false;
/* Sons gerados aqui mesmo (sem arquivo externo), no volume máximo do arquivo:
   "sino": dim-dom de campainha de restaurante, timbre redondo, toca uma vez (padrão, para aguentar horas de feira);
   "bip": bip agudo forte, 3 vezes (para quando precisar chamar mais atenção). */
const SR=22050;
function somPCM(tipo){
  if(tipo==="bip"){const len=Math.ceil(SR*1.5),d=new Float32Array(len);
    [[2637,0],[3322,.19],[2637,.5],[3322,.69],[2637,1.0],[3322,1.19]].forEach(([f,t0])=>{const a=Math.floor(t0*SR),n=Math.floor(.17*SR);
      for(let i=0;i<n&&a+i<len;i++){const env=Math.min(1,i/60,(n-i)/60);d[a+i]=Math.max(-1,Math.min(1,Math.sin(2*Math.PI*f*i/SR)*3))*env}});return d}
  /* sino: duas notas (Mi e Dó, intervalo consonante), parciais de sino que se apagam suave */
  const len=Math.ceil(SR*1.6),d=new Float32Array(len);
  [[1319,0],[1047,.34]].forEach(([f,t0])=>{const a=Math.floor(t0*SR),n=len-a;
    for(let i=0;i<n;i++){const t=i/SR,at=Math.min(1,i/(SR*.004));
      d[a+i]+=at*(Math.exp(-t/.42)*Math.sin(2*Math.PI*f*t)+.45*Math.exp(-t/.22)*Math.sin(2*Math.PI*f*2*t)+.18*Math.exp(-t/.12)*Math.sin(2*Math.PI*f*3.01*t))}});
  let pk=0;for(let i=0;i<len;i++){d[i]=Math.tanh(1.6*d[i]);pk=Math.max(pk,Math.abs(d[i]))}
  for(let i=0;i<len;i++){d[i]=d[i]/pk*.98;if(i>len-400)d[i]*=(len-i)/400}
  return d}
function somURL(tipo){const f=somPCM(tipo),len=f.length,buf=new ArrayBuffer(44+len*2),dv=new DataView(buf),w=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
  w(0,"RIFF");dv.setUint32(4,36+len*2,true);w(8,"WAVE");w(12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
  dv.setUint32(24,SR,true);dv.setUint32(28,SR*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,"data");dv.setUint32(40,len*2,true);
  const pcm=new Int16Array(buf,44);for(let i=0;i<len;i++)pcm[i]=Math.round(f[i]*32767);
  return URL.createObjectURL(new Blob([buf],{type:"audio/wav"}))}
const somArmed=()=>alarmOk||(!!actx&&actx.state==="running");
function setSomTipo(t){somTipo=t==="bip"?"bip":"sino";ls.set("cf.somTipo",somTipo);if(alarmEl){try{alarmEl.pause();URL.revokeObjectURL(alarmEl.src)}catch(e){}alarmEl.src=somURL(somTipo)}}
function armSom(test){
  try{if(navigator.audioSession)navigator.audioSession.type="playback"}catch(e){}
  try{if(!alarmEl){alarmEl=new Audio(somURL(somTipo));alarmEl.preload="auto";alarmEl.volume=1}
    if(!alarmOk){alarmEl.muted=!test;const pr=alarmEl.play();if(pr&&pr.then)pr.then(()=>{alarmOk=true;if(!test){alarmEl.pause();alarmEl.currentTime=0}alarmEl.muted=false;renderStation()},()=>{alarmEl.muted=false})}}catch(e){}
  try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state!=="running")actx.resume().then(renderStation,()=>{})}catch(e){actx=null}}
/* reserva: toca o mesmo som pelo Web Audio */
function somWebAudio(){if(!actx||actx.state!=="running")return;try{const f=somPCM(somTipo),bf=actx.createBuffer(1,f.length,SR);bf.getChannelData(0).set(f);const src=actx.createBufferSource();src.buffer=bf;src.connect(actx.destination);src.start()}catch(e){}}
function plim(){if(!somOn)return;
  try{navigator.vibrate&&navigator.vibrate(somTipo==="bip"?[300,120,300,120,300]:[250,100,250])}catch(e){}
  if(alarmEl&&alarmOk){try{alarmEl.currentTime=0;const pr=alarmEl.play();if(pr&&pr.catch)pr.catch(somWebAudio)}catch(e){somWebAudio()}}else somWebAudio()}
/* aviso na tela: faixa amarela grande com o número, por alguns segundos */
let flashT=null;
function flashNovo(nums){const el=$("#novoPedido");if(!el)return;el.textContent="PEDIDO NOVO · "+nums.map(pad).join(" · ");el.hidden=false;el.classList.remove("on");void el.offsetWidth;el.classList.add("on");
  clearTimeout(flashT);flashT=setTimeout(()=>{el.hidden=true},5000)}
function renderStation(){
  const st=$("#station"),on=SOUND_VIEWS.includes(view)&&$("#v-lock").hidden;st.hidden=!on;if(!on)return;
  const b=$("#btnSom");
  if(!somOn){b.textContent="Som desligado · ligar";b.className="sbtn"}
  else if(!somArmed()){b.textContent="Tocar aqui para ativar o som";b.className="sbtn arm"}
  else{b.textContent="Som ligado · desligar";b.className="sbtn on"}
  $("#stTxt").textContent=somOn?"Toca a cada pedido novo de pastel, com aviso na tela. Deixe o volume do aparelho no máximo.":"Sem som neste aparelho. O aviso na tela continua.";
  document.querySelectorAll("#somTipo [data-st]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.st===somTipo));$("#somTipo").hidden=!somOn;
}
$("#btnSom").addEventListener("click",()=>{
  if(somOn&&!somArmed()){armSom(true);setTimeout(()=>{if(!alarmOk)somWebAudio();renderStation()},250);return}
  somOn=!somOn;ls.set("cf.som",somOn?"1":"0");if(somOn){armSom(true);setTimeout(()=>{if(!alarmOk)somWebAudio();renderStation()},250)}else if(alarmEl){try{alarmEl.pause()}catch(e){}}renderStation()});
$("#somTipo").addEventListener("click",e=>{const b=e.target.closest("[data-st]");if(!b)return;setSomTipo(b.dataset.st);
  if(!alarmOk)armSom(true);else plim();setTimeout(()=>{if(!alarmOk)somWebAudio();renderStation()},250);renderStation()});
/* o navegador só libera som depois de um toque na tela */
document.addEventListener("pointerdown",e=>{if(e.target.closest&&e.target.closest("#btnSom"))return;if(somOn&&SOUND_VIEWS.includes(view)&&!somArmed())armSom(false)},{passive:true});
function checkSom(list){
  const q={ids:new Set(list.map(o=>o.id)),fritura:list.filter(o=>!o.pastelDone&&sum(o.pastel)>0).length,caldo:list.filter(o=>!o.caldoDone&&sum(o.caldo)>0).length};
  if(prevQ&&SOUND_VIEWS.includes(view)&&$("#v-lock").hidden){const novos=list.filter(o=>!prevQ.ids.has(o.id)&&!o.pastelDone&&sum(o.pastel)>0);
    if(novos.length){plim();flashNovo(novos.map(o=>o.num))}}
  prevQ=q;
}

/* ---------- tema claro/escuro (vale só para este aparelho) ---------- */
const THEMES=[["auto","automático"],["light","claro"],["dark","escuro"]];
let theme=ls.get("cf.tema","auto");
function applyTheme(){const r=document.documentElement;if(theme==="auto")r.removeAttribute("data-theme");else r.setAttribute("data-theme",theme);
  const t=THEMES.find(x=>x[0]===theme)||THEMES[0];$("#btnTheme").textContent="Tema: "+t[1];$("#btnTheme").setAttribute("aria-label","Tema "+t[1]+". Tocar para trocar")}
$("#btnTheme").addEventListener("click",()=>{const i=THEMES.findIndex(x=>x[0]===theme);theme=THEMES[(i+1)%THEMES.length][0];ls.set("cf.tema",theme);applyTheme()});
applyTheme();

/* ---------- aparelho preso numa aba ---------- */
const PIN_NAMES={caixa:"Caixa",fritura:"Fritura",bandeja:"Bandeja",caldo:"Caldo"};
function renderChrome(){
  if(!PIN_NAMES[pinnedView])pinnedView="";
  $("#tabs").hidden=!!pinnedView;
  const b=$("#btnPinned");b.hidden=!pinnedView;
  if(pinnedView)b.textContent=`Só ${PIN_NAMES[pinnedView]} · Destravar`;
  document.querySelectorAll("#pinSel button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.pv===pinnedView));
  renderStation();
}
/* destravar: pede a senha do gerente toda vez, mesmo com a área do gerente desbloqueada */
function releasePin(){const was=PIN_NAMES[pinnedView];pinnedView="";unpinning=false;ls.set("cf.preso","");toast(`Aparelho destravado. Todas as abas voltaram${was?" (estava só em "+was+")":""}.`)}
$("#btnPinned").addEventListener("click",()=>{if(!pinnedView)return;
  unpinning=true;pinEntry="";pinErr="";show(view)});
$("#pinSel").addEventListener("click",e=>{const b=e.target.closest("[data-pv]");if(!b)return;const v=b.dataset.pv;
  if(!v){pinnedView="";ls.set("cf.preso","");renderChrome();toast("Aparelho livre: todas as abas aparecem.");return}
  pinnedView=v;ls.set("cf.preso",v);show(v);
  toast(`Pronto: este aparelho agora mostra só ${PIN_NAMES[v]}. Para soltar, toque em "Destravar" no topo.`)});

/* ---------- caixa ---------- */
function setCaixa(c){caixa=c;ls.set("cf.caixa",c);document.querySelectorAll("#caixaSel button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.c===c))}
$("#caixaSel").addEventListener("click",e=>{const b=e.target.closest("button");if(b)setCaixa(b.dataset.c)});
function renderKeys(){
  const mk=(list,kind)=>list.map(it=>{const f=it.n,q=cart[kind][f]||0;
    let cls=kind!=="pastel"?" "+kind:"",rest="";
    if(kind==="pastel"){const r=remaining(f);if(r!==null){const left=r-q;
      if(left<=0){cls+=" out";rest=r<=0?"Acabou":"Último no pedido"}else if(left<=cfg.lowAt){cls+=" low";rest=`Restam ${left}`}}}
    if(f.length>16)cls+=" xlong";else if(f.length>11)cls+=" long";
    const btn=`<button class="key${cls}" data-k="${kind}" data-f="${esc(f)}">${esc(f).replace(/\//g,"/<wbr>")}<span class="pr">${brl(it.p)}</span>${rest?`<span class="rest">${rest}</span>`:""}${q?`<span class="q">${q}</span>`:""}</button>`;
    return kind==="pastel"?`<div class="kw">${btn}<button class="info" type="button" data-info="${esc(f)}" aria-label="Ver recheio de ${esc(f)}">ver recheio</button></div>`:btn}).join("");
  $("#keysPastel").innerHTML=cfg.pastel.length?mk(cfg.pastel,"pastel"):'<div class="empty">Cadastre os pastéis em Ajustes.</div>';
  $("#keysCaldo").innerHTML=cfg.caldo.length?mk(cfg.caldo,"caldo"):'<div class="empty">Sem caldo configurado.</div>';
  caldoSel=caldoSel.filter(n=>cfg.caldoSabores.some(x=>x.n===n));
  $("#chipsCaldo").innerHTML=cfg.caldo.length&&cfg.caldoSabores.length?`<button type="button" class="chip puro" data-cs="" aria-pressed="${!caldoSel.length}">Puro</button>`+cfg.caldoSabores.map(x=>`<button type="button" class="chip" data-cs="${esc(x.n)}" aria-pressed="${caldoSel.includes(x.n)}">${esc(x.n)}</button>`).join(""):"";
  $("#keysBebida").innerHTML=cfg.bebida.length?mk(cfg.bebida,"bebida"):'<div class="empty">Sem bebidas configuradas.</div>';
}
function renderCart(){
  const rows=[],tag={pastel:"",caldo:" <span class='muted'>(caldo)</span>",bebida:" <span class='muted'>(bebida)</span>"};
  ["pastel","caldo","bebida"].forEach(k=>Object.entries(cart[k]).forEach(([f,q])=>{if(q>0)rows.push(`<li><span>${q}× ${esc(f)}${tag[k]} <span class='muted'>${brl(q*priceOf(k,f))}</span></span><button aria-label="Tirar um ${esc(f)}" data-minus="${k}" data-f="${esc(f)}">−</button></li>`)}));
  $("#cartList").innerHTML=rows.join("")||'<li class="empty">Toque nos itens para montar o pedido.</li>';
  $("#cartTotal").textContent=brl(cartTotal(cart));
  renderTroco();
  const n=sum(cart.pastel)+sum(cart.caldo)+sum(cart.bebida);
  $("#consumo").hidden=!n; $("#consumo").classList.toggle("need",!!n&&!consumo);
  document.querySelectorAll("#consumo [data-cons]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.cons===consumo));
  $("#btnGo").disabled=!n||busy||!db||!consumo; $("#btnGo").textContent=busy?"Gerando número…":(!n?"Finalizar":!consumo?"Escolha: aqui ou viagem":addConta?`Acrescentar na conta · ${n} ${n===1?"item":"itens"}`:`Finalizar · ${n} ${n===1?"item":"itens"}`);
  $("#btnClear").hidden=!n;
  /* celular: barra fixa com o total enquanto o botão Finalizar está fora da tela */
  const bar=n>0&&!cartVisible;$("#cxBar").hidden=!bar;document.body.classList.toggle("has-cxbar",n>0);
  if(n){$("#cxN").textContent=`${n} ${n===1?"item":"itens"}${consumo?" · "+CONS[consumo]:""}`;$("#cxT").textContent=brl(cartTotal(cart))}
}
try{new IntersectionObserver(es=>{cartVisible=es[0].isIntersecting;renderCart()}).observe($("#btnGo"))}catch(e){}
$("#cxGo").addEventListener("click",()=>{const g=$("#btnGo");try{g.scrollIntoView({behavior:"smooth",block:"end"})}catch(_){g.scrollIntoView(false)}});
/* comer aqui ou para viagem: escolha obrigatória a cada pedido */
let consumo=null;
const CONS={aqui:"Comer aqui",viagem:"Para viagem"};
const acTag=o=>o.acrescimo?'<span class="cons acresc">Acréscimo</span> ':"";
const consTag=o=>CONS[o.consumo]?`<span class="cons ${o.consumo}">${CONS[o.consumo]}</span>`:"";
$("#consumo").addEventListener("click",e=>{const b=e.target.closest("[data-cons]");if(!b)return;consumo=b.dataset.cons;renderCart()});
document.addEventListener("click",e=>{
  const k=e.target.closest(".key");
  if(k){const kind=k.dataset.k;let f=k.dataset.f;
    if(kind==="pastel"){const r=remaining(f);if(r!==null&&(cart.pastel[f]||0)>=r){toast(r<=0?`${f} acabou. Reponha em Estoque se montarem mais.`:`Só restam ${r} de ${f}.`);return}}
    if(kind==="caldo"&&caldoSel.length){f=f+" + "+caldoSel.join(" + ");caldoSel=[]}
    cart[kind][f]=(cart[kind][f]||0)+1;renderKeys();renderCart();return}
  const cs=e.target.closest("[data-cs]");
  if(cs){const n=cs.dataset.cs;if(!n)caldoSel=[];else caldoSel=caldoSel.includes(n)?caldoSel.filter(x=>x!==n):[...caldoSel,n];renderKeys();return}
  const m=e.target.closest("[data-minus]");
  if(m){const kind=m.dataset.minus,f=m.dataset.f;cart[kind][f]=Math.max(0,(cart[kind][f]||0)-1);if(!cart[kind][f])delete cart[kind][f];renderKeys();renderCart()}
});
$("#btnClear").addEventListener("click",()=>{cart=emptyCart();recebido=0;split=null;consumo=null;pagar="agora";addConta=null;$("#pagNome").value="";syncTrInput();renderKeys();renderCart()});
/* ---------- fichas a cobrar: pedido sai para produção e o caixa cobra depois ---------- */
let pagar="agora",cbKey=null,cbRec=0,addConta=null;
$("#pagBox").addEventListener("click",e=>{const b=e.target.closest("[data-pag]");if(!b)return;pagar=b.dataset.pag;
  if(pagar==="depois"){split=null;recebido=0;syncTrInput();setTimeout(()=>$("#pagNome").focus(),30)}renderCart()});
const itemsAll=o=>[fmtItems(o.pastel),fmtItems(o.caldo),sum(o.bebida)?"bebida: "+fmtItems(o.bebida):""].filter(Boolean).join(" · ");
/* conta: o primeiro pedido não pago e tudo o que foi acrescentado nele depois (campo "conta" = id do primeiro) */
const contaKey=o=>o.conta||o.id;
function contas(){const m=new Map();
  orders.filter(o=>o.pago===false).sort(fila).forEach(o=>{const k=contaKey(o);if(!m.has(k))m.set(k,[]);m.get(k).push(o)});
  return [...m.entries()].map(([k,l])=>({k,l,nome:(l.find(o=>o.cobrarNome)||{}).cobrarNome||"",nums:[...new Set(l.map(o=>pad(o.num)))].join(" + "),total:Math.round(l.reduce((a,o)=>a+(+o.total||0),0)*100)/100}))}
function renderCobrar(){
  const cs=contas(),el=$("#aCobrar");if(addConta&&!cs.some(c=>c.k===addConta.k))cancelAdd();
  el.hidden=!cs.length;if(!cs.length)return;
  const tot=cs.reduce((a,c)=>a+c.total,0);
  el.innerHTML=`<h3>A cobrar · ${cs.length} ${cs.length===1?"conta":"contas"} · ${brl(tot)}</h3>`+cs.map(c=>`<div class="cb-row"><span class="num">${c.nums.replace(/ \+ /g,"<br>")}</span><span class="it">${c.nome?esc(c.nome):"Sem nome"}<small>${c.l.map(o=>(o.acrescimo?"+ ":"")+esc(itemsAll(o))).join("<br>")}</small></span><span class="v">${brl(c.total)}</span><span class="cb-b"><button type="button" class="cb-add" data-acrescentar="${esc(c.k)}">Acrescentar</button><button type="button" data-cobrar="${esc(c.k)}">Receber</button></span></div>`).join("");
}
/* acrescentar: o caixa monta os itens novos; ao finalizar, saem com número novo para a produção, na mesma conta */
function cancelAdd(){addConta=null;pagar="agora";renderCart()}
document.addEventListener("click",e=>{const b=e.target.closest("[data-acrescentar]");if(!b)return;const c=contas().find(x=>x.k===b.dataset.acrescentar);if(!c)return;
  addConta={k:c.k,nome:c.nome,nums:c.nums,num:c.l[0].num};pagar="depois";split=null;recebido=0;syncTrInput();renderCart();
  try{$(".caixa-grid").scrollIntoView({behavior:"smooth",block:"start"})}catch(_){}
  toast(`Toque nos itens novos e finalize para acrescentar na conta ${c.nome||c.nums}.`)});
$("#addCancel").addEventListener("click",cancelAdd);
function renderCbTroco(){const c=contas().find(x=>x.k===cbKey);if(!c)return;const t=Math.round(c.total*100),d=cbRec-t;
  $("#cbTroco").innerHTML=cbRec?`<span>${d<0?"Falta":"Troco"}</span><b>${brl(Math.abs(d)/100)}</b>`:"";$("#cbTroco").classList.toggle("falta",d<0);
  $("#cbHow").textContent=cbRec&&d>0?"Devolver: "+comoDevolver(d).join(" · "):"";
  $("#cbDin").disabled=!cbRec||d<0}
document.addEventListener("click",e=>{const b=e.target.closest("[data-cobrar]");if(!b)return;const c=contas().find(x=>x.k===b.dataset.cobrar);if(!c)return;
  cbKey=c.k;cbRec=0;$("#cbRec").value="";$("#cbTitle").textContent="Receber pedido "+c.nums+(c.l.length>1?" (com acréscimos)":"");$("#cbTotal").textContent=brl(c.total);
  $("#cbItens").innerHTML=(c.nome?`<b>${esc(c.nome)}</b><br>`:"")+c.l.map(o=>`${pad(o.num)}${o.acrescimo?" (acréscimo)":""}: ${esc(itemsAll(o))} · ${brl(o.total)}`).join("<br>");renderCbTroco();$("#ovCobrar").hidden=false});
$("#cbRec").addEventListener("input",e=>{const el=e.target,dig=el.value.replace(/\D/g,"").replace(/^0+/,"").slice(0,7);cbRec=dig?parseInt(dig,10):0;el.value=dig?brl(cbRec/100):"";
  try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}renderCbTroco()});
$("#cbClose").addEventListener("click",()=>{$("#ovCobrar").hidden=true;cbKey=null});
/* recebe a conta inteira; em dinheiro, o valor recebido e o troco ficam no primeiro pedido */
async function receber(tipo){const c=contas().find(x=>x.k===cbKey);if(!c||!db)return;const t=Math.round(c.total*100),now=Date.now();
  $("#cbDin").disabled=true;$("#cbPix").disabled=true;let fail=0;
  for(const [i,o] of c.l.entries()){const upd={pago:true,pagoAt:now};
    if(tipo==="dinheiro")upd.pagamento=i===0?{tipo:"dinheiro",recebido:cbRec/100,troco:Math.max(0,(cbRec-t)/100)}:{tipo:"dinheiro",recebido:0,troco:0};
    try{await db.doc("orders/"+o.id).update(upd)}catch(err){fail++}}
  if(fail)toast("Faltou salvar parte da conta. Confira a internet e toque em Receber de novo.");
  else{$("#ovCobrar").hidden=true;cbKey=null;toast(`Conta ${c.nums} recebida.`)}
  $("#cbPix").disabled=false;renderCbTroco();render()}
$("#cbDin").addEventListener("click",()=>receber("dinheiro"));
$("#cbPix").addEventListener("click",()=>receber("pix"));
/* ---------- cancelar pedido: marca como cancelado (não apaga), some das telas e do faturamento ---------- */
let cnAsk=null,cnLast=null;
const stOf=o=>{const p=sum(o.pastel)+sum(o.bebida)>0,c=sum(o.caldo)>0,pend=(p&&!o.pastelDone)||(c&&!o.caldoDone);return pend?"na fila":"já entregue"};
function renderCancel(){
  const q=$("#cnBusca").value.replace(/\D/g,""),el=$("#cnList");
  let l=allOrders.slice().sort((a,b)=>b.t-a.t);if(q)l=l.filter(o=>String(o.num)===String(+q)||pad(o.num).includes(q));else l=l.slice(0,30);
  el.innerHTML=l.length?l.map(o=>{const pago=o.pago!==false;
    if(cnAsk===o.id)return `<div class="cn-row ask"><b>Cancelar o pedido ${pad(o.num)}${o.acrescimo?" (acréscimo)":""} de ${brl(o.total)}?</b><span>${pago?`Se o cliente já pagou, devolva ${brl(o.total)}.`:"Era a cobrar: não tem nada para devolver."}</span><div class="row"><button type="button" class="danger" data-cnyes="${esc(o.id)}">Sim, cancelar</button><button type="button" class="ghost" data-cnno="1">Não</button></div></div>`;
    return `<div class="cn-row${o.cancelado?" off":""}"><span class="num">${pad(o.num)}</span><span class="it">${esc(itemsAll(o))}<small>${o.cancelado?"Cancelado":stOf(o)}${o.acrescimo?" · acréscimo":""}${o.pago===false?" · a cobrar":""}${o.cobrarNome?" · "+esc(o.cobrarNome):""} · caixa ${esc(o.caixa||"")}</small></span><span class="v">${brl(o.total)}</span>${o.cancelado?"<span></span>":`<button type="button" class="x" data-cnask="${esc(o.id)}">Cancelar</button>`}</div>`}).join("")
    :`<div class="empty">${q?"Nenhum pedido com esse número hoje.":"Nenhum pedido hoje."}</div>`;
  const u=$("#cnUndo");u.hidden=!cnLast;if(cnLast)u.innerHTML=`<span>Pedido ${pad(cnLast.num)} cancelado.${cnLast.devolver?` Devolva ${brl(cnLast.total)} ao cliente.`:""}</span><button type="button" data-cnundo="1">Desfazer</button>`;
}
$("#btnCancelar").addEventListener("click",()=>{cnAsk=null;cnLast=null;$("#cnBusca").value="";$("#ovCancel").hidden=false;renderCancel();setTimeout(()=>$("#cnBusca").focus(),50)});
$("#cnClose").addEventListener("click",()=>{$("#ovCancel").hidden=true;cnAsk=null});
$("#cnBusca").addEventListener("input",()=>{cnAsk=null;renderCancel()});
$("#ovCancel").addEventListener("click",async e=>{
  const a=e.target.closest("[data-cnask]");if(a){cnAsk=a.dataset.cnask;renderCancel();return}
  if(e.target.closest("[data-cnno]")){cnAsk=null;renderCancel();return}
  const y=e.target.closest("[data-cnyes]");if(y&&db){const o=allOrders.find(x=>x.id===y.dataset.cnyes);if(!o)return;y.disabled=true;
    try{await db.doc("orders/"+o.id).update({cancelado:true,canceladoAt:Date.now(),canceladoPor:caixa});cnAsk=null;cnLast={id:o.id,num:o.num,total:o.total,devolver:o.pago!==false};toast(`Pedido ${pad(o.num)} cancelado.`)}
    catch(err){y.disabled=false;toast("Não salvou. Confira a internet e toque de novo.")}
    renderCancel();render();return}
  if(e.target.closest("[data-cnundo]")&&cnLast&&db){try{await db.doc("orders/"+cnLast.id).update({cancelado:false});toast(`Pedido ${pad(cnLast.num)} voltou.`);cnLast=null}catch(err){toast("Não deu para desfazer. Tente de novo.")}renderCancel();render()}
});
/* ---------- troco ---------- */
let recebido=0;
function trocoInfo(total){
  const t=Math.round(total*100),r=Math.round(recebido*100);
  return {t,r,dif:r-t};
}
/* ---------- dividir conta ---------- */
let split=null;
function cartUnits(){
  const u=[];["pastel","caldo","bebida"].forEach(k=>Object.entries(cart[k]).forEach(([f,q])=>{for(let i=0;i<q;i++)u.push({id:k+"|"+f+"|"+i,k,f,c:Math.round(priceOf(k,f)*100)})}));
  return u;
}
function splitCalc(){
  const T=Math.round(cartTotal(cart)*100);
  return {T,...dividirConta({total:T,pessoas:split.n,modo:split.mode,unidades:split.mode==="item"?cartUnits():[],donos:split.assign})};
}
function personTroco(i,cents){
  const r=split.rec[i]||0;
  if(!r)return {txt:"Se pagar em dinheiro, digite quanto deu para ver o troco.",cls:""};
  const d=r-cents;
  if(d<0)return {txt:"Falta "+brl(-d/100),cls:"falta"};
  return {txt:d?"Troco "+brl(d/100)+" · Devolver: "+comoDevolver(d).join(" · "):"Sem troco",cls:"ok"};
}
function renderSplit(){
  const {T,parts,sem}=splitCalc();
  $("#spTotal").textContent=brl(T/100);
  document.querySelectorAll("#spMode button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.mode===split.mode));
  $("#spIgual").hidden=split.mode!=="igual";$("#spItem").hidden=split.mode!=="item";
  $("#spN").textContent=split.n;$("#spMinus").disabled=split.n<=2;$("#spPlus").disabled=split.n>=20;
  if(split.mode==="item"){
    $("#spPeople").innerHTML=Array.from({length:split.n},(_,i)=>`<button type="button" class="chip" data-person="${i}" aria-pressed="${split.cur===i}">Pessoa ${i+1}</button>`).join("")
      +`<button type="button" class="chip puro" id="spAddP"${split.n>=20?" disabled":""}>+ Pessoa</button>`+(split.n>2?`<button type="button" class="chip puro" id="spRmP">− Pessoa</button>`:"");
    $("#spUnits").innerHTML=cartUnits().map(u=>{const arr=(split.assign[u.id]||[]).filter(p=>p<split.n).sort((a,b)=>a-b);const set=arr.length>0;
      const each=arr.length>1?`<br><small class="muted">${brl(u.c/100)} ÷ ${arr.length} = ${brl(Math.floor(u.c/arr.length)/100)} cada</small>`:`<br><small class="muted">${brl(u.c/100)}</small>`;
      return `<button type="button" class="unit${set?" set":""}${arr.includes(split.cur)?" mine":""}${arr.length>1?" shared":""}" data-u="${esc(u.id)}"><span class="un">${esc(u.f)}${each}</span><span class="who">${set?arr.map(p=>"P"+(p+1)).join("+"):"—"}</span></button>`}).join("");
    $("#spSem").textContent=sem?`Falta escolher de quem é: ${brl(sem/100)}`:"";
  }
  $("#spList").innerHTML=parts.map((c,i)=>{const t=personTroco(i,c),pd=!!split.paid[i];return `<div class="prow${pd?" done":""}">
    <span class="pn">Pessoa ${i+1}</span><span class="pv">${brl(c/100)}</span>
    <input id="sp-rec-${i}" data-rec="${i}" inputmode="numeric" autocomplete="off" placeholder="Recebeu em dinheiro? R$ 0,00" value="${split.rec[i]?brl(split.rec[i]/100):""}" aria-label="Valor recebido da pessoa ${i+1}">
    <button type="button" class="paid" data-paid="${i}" aria-pressed="${pd}">${pd?"Pago ✓":"Marcar pago"}</button>
    <span class="pt ${t.cls}" id="sp-pt-${i}">${t.txt}</span></div>`}).join("");
}
function openSplit(){if(!split)split={mode:"igual",n:2,cur:0,assign:{},rec:{},paid:{}};$("#ovSplit").hidden=false;renderSplit();renderCart()}
$("#btnSplit").addEventListener("click",openSplit);
$("#splitOpen").addEventListener("click",openSplit);
$("#spDone").addEventListener("click",()=>{$("#ovSplit").hidden=true;renderCart()});
$("#spCancel").addEventListener("click",()=>{split=null;$("#ovSplit").hidden=true;renderCart()});
$("#ovSplit").addEventListener("click",e=>{
  if(!split)return;const t=e.target;
  const m=t.closest("[data-mode]");if(m){split.mode=m.dataset.mode;renderSplit();return}
  if(t.closest("#spMinus")){if(split.n>2){split.n--;delete split.rec[split.n];delete split.paid[split.n]}renderSplit();return}
  if(t.closest("#spPlus")){if(split.n<20)split.n++;renderSplit();return}
  const pp=t.closest("[data-person]");if(pp){split.cur=+pp.dataset.person;renderSplit();return}
  if(t.closest("#spAddP")){if(split.n<20){split.n++;split.cur=split.n-1}renderSplit();return}
  if(t.closest("#spRmP")){if(split.n>2){split.n--;Object.keys(split.assign).forEach(k=>{split.assign[k]=split.assign[k].filter(p=>p<split.n);if(!split.assign[k].length)delete split.assign[k]});delete split.rec[split.n];delete split.paid[split.n];if(split.cur>=split.n)split.cur=split.n-1}renderSplit();return}
  const u=t.closest("[data-u]");if(u){const id=u.dataset.u,arr=split.assign[id]||[];split.assign[id]=arr.includes(split.cur)?arr.filter(p=>p!==split.cur):[...arr,split.cur];if(!split.assign[id].length)delete split.assign[id];renderSplit();return}
  const pd=t.closest("[data-paid]");if(pd){const i=+pd.dataset.paid;split.paid[i]=!split.paid[i];renderSplit();return}
});
$("#ovSplit").addEventListener("input",e=>{const el=e.target;if(!el.dataset.rec||!split)return;const i=+el.dataset.rec;
  const dig=el.value.replace(/\D/g,"").replace(/^0+/,"").slice(0,7);split.rec[i]=dig?parseInt(dig,10):0;el.value=dig?brl(split.rec[i]/100):"";
  try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}
  const {parts}=splitCalc(),tr=personTroco(i,parts[i]),pt=$("#sp-pt-"+i);pt.textContent=tr.txt;pt.className="pt "+tr.cls});
function renderSplitInfo(){
  const has=cartTotal(cart)>0;
  if(!has&&split)split=null;
  $("#btnSplit").hidden=!has||!!split||pagar==="depois";
  $("#splitInfo").hidden=!split;
  if(split){const {sem}=splitCalc(),pagos=Object.values(split.paid).filter(Boolean).length;
    $("#splitTxt").textContent=`Dividida em ${split.n}${split.mode==="item"?" por item":""} · ${pagos} de ${split.n} pagos${sem?" · faltam itens sem dono":""}`}
}
function renderTroco(){
  renderSplitInfo();
  const total=cartTotal(cart),has=total>0;
  $("#troco").hidden=!has||!!split||pagar==="depois";
  $("#pagBox").hidden=!has||!!addConta;
  $("#addBar").hidden=!addConta;if(addConta)$("#addTxt").textContent=`Acrescentando na conta ${addConta.nome?addConta.nome+" · ":""}${addConta.nums}`;
  document.querySelectorAll("#pagBox [data-pag]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pag===pagar));
  $("#pagNome").hidden=pagar!=="depois";
  if(!has){recebido=0;syncTrInput();return}
  $("#trOut").hidden=!recebido;
  if(!recebido)return;
  const {dif}=trocoInfo(total);
  $("#trRec").textContent=brl(recebido);
  const line=$("#trLine");line.classList.toggle("falta",dif<0);
  $("#trLbl").textContent=dif<0?"Falta":"Troco";
  $("#trVal").textContent=brl(Math.abs(dif)/100);
  const how=dif>0?comoDevolver(dif):[];
  $("#trHow").textContent=dif<0?"O cliente ainda precisa pagar essa diferença.":dif===0?"Sem troco.":"Devolver: "+how.join(" · ");
}
/* campo estilo maquininha: só números, os dois últimos são centavos */
function syncTrInput(){const el=$("#trInput");if(document.activeElement===el&&el.dataset.typing)return;el.value=recebido?brl(recebido):""}
$("#trInput").addEventListener("input",e=>{const el=e.target;const dig=el.value.replace(/\D/g,"").replace(/^0+/,"").slice(0,7);
  recebido=dig?parseInt(dig,10)/100:0;el.value=dig?brl(recebido):"";el.dataset.typing="1";
  try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}
  renderTroco()});
$("#trInput").addEventListener("blur",e=>{delete e.target.dataset.typing;syncTrInput()});
$("#trInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur()}});
$("#notas").addEventListener("click",e=>{const b=e.target.closest("[data-nota]");if(!b)return;
  if(b.dataset.nota==="exato")recebido=Math.round(cartTotal(cart)*100)/100;else recebido=Math.round((recebido+ +b.dataset.nota)*100)/100;
  delete $("#trInput").dataset.typing;syncTrInput();renderTroco()});
$("#trClear").addEventListener("click",()=>{recebido=0;delete $("#trInput").dataset.typing;syncTrInput();renderTroco()});
let infoFlavor=null;
document.addEventListener("click",e=>{const b=e.target.closest("[data-info]");if(!b)return;
  const it=cfg.pastel.find(x=>x.n===b.dataset.info);if(!it)return;infoFlavor=it.n;
  $("#infoName").textContent=it.n;$("#infoPrice").textContent=brl(it.p);
  $("#infoDesc").textContent=it.d||"Recheio ainda não cadastrado. O gerente pode cadastrar em Ajustes.";
  $("#infoDesc").style.color=it.d?"":"var(--muted)";
  const r=remaining(it.n),left=r===null?Infinity:r-(cart.pastel[it.n]||0);
  $("#infoAdd").disabled=left<=0;$("#infoAdd").textContent=left<=0?"Acabou":"Adicionar ao pedido";
  $("#ovInfo").hidden=false;$("#infoClose").focus()});
$("#infoClose").addEventListener("click",()=>{$("#ovInfo").hidden=true});
$("#ovInfo").addEventListener("click",e=>{if(e.target.id==="ovInfo")$("#ovInfo").hidden=true});
$("#infoAdd").addEventListener("click",()=>{if(infoFlavor){cart.pastel[infoFlavor]=(cart.pastel[infoFlavor]||0)+1;renderKeys();renderCart()}$("#ovInfo").hidden=true});

/* Numera o pedido e escolhe a fritada (lote) dele dentro da trava do contador,
   para os dois caixas nunca pegarem o mesmo número nem passarem da capacidade.
   Regra: a fritada mais antiga com pedidos pendentes é a que está no fogo e fica travada;
   pedido novo entra na primeira fritada seguinte que tiver espaço, ou abre uma nova. */
function currentLot(){let m=null;orders.forEach(o=>{if(o.lote>0&&!o.pastelDone&&sum(o.pastel)>0&&(m===null||o.lote<m))m=o.lote});return m}
function pickLot(lots,size){
  const ids=Object.keys(lots).map(Number).filter(x=>x>0).sort((a,b)=>a-b),max=ids.length?ids[ids.length-1]:0;
  const cur=currentLot();
  if(cur===null||size>cfg.capacity)return max+1;
  const pend={};orders.forEach(o=>{if(o.lote>0){pend[o.lote]=pend[o.lote]||{p:0};if(!o.pastelDone&&sum(o.pastel)>0)pend[o.lote].p++}});
  for(const id of ids){
    if(id<=cur)continue;
    if(pend[id]&&pend[id].p===0)continue;
    if((lots[id]||0)+size<=cfg.capacity)return id;
  }
  return max+1;
}
$("#btnGo").addEventListener("click",async()=>{
  if(busy||!db)return; if(!consumo){toast("Pergunte se é para comer aqui ou para viagem.");return}
  busy=true; renderCart(); const cons=consumo,depois=pagar==="depois"||!!addConta,ac=addConta,nome=ac?ac.nome:$("#pagNome").value.trim().slice(0,40);
  const pastel={...cart.pastel},caldo={...cart.caldo},bebida={...cart.bebida},total=Math.round(cartTotal(cart)*100)/100;
  try{
    /* acréscimo numa conta a cobrar repete o número da ficha que o cliente já tem */
    let n=ac?ac.num:0;
    const hasP=sum(pastel)>0,hasC=sum(caldo)>0,hasB=sum(bebida)>0;
    const rec=recebido,troco=rec?Math.round((rec-total)*100)/100:0;
    const ord={num:n,day:today(),t:Date.now(),caixa,consumo:cons,pastel,caldo,bebida,total,pastelDone:!hasP&&!hasB,caldoDone:!hasC};
    if(depois){ord.pago=false;if(nome)ord.cobrarNome=nome;if(ac){ord.conta=ac.k;ord.acrescimo=true}}
    else if(split){const {parts}=splitCalc();ord.pagamento={tipo:"dividido",modo:split.mode,partes:parts.map((c,i)=>{const p={valor:c/100,pago:!!split.paid[i]};const r=split.rec[i]||0;if(r){p.recebido=r/100;p.troco=Math.max(0,(r-c)/100)}return p})}}
    else if(rec)ord.pagamento={tipo:"dinheiro",recebido:rec,troco:Math.max(0,troco)};
    const nSplit=split?split.n:0;
    /* pedido novo: número e pedido gravados juntos numa única conversa com o servidor (mais rápido no 4G) */
    if(ac)await db.collection("orders").add(ord);else{n=await db.newOrder("counters/"+today(),today(),ord);ord.num=n}
    cart=emptyCart(); recebido=0; split=null; consumo=null; pagar="agora"; addConta=null; $("#pagNome").value=""; syncTrInput(); renderKeys();
    $("#ovNum").textContent=pad(n);
    $("#ovCons").textContent=CONS[cons]; $("#ovCons").className="ovcons "+cons;
    const fc=` · ${cons==="viagem"?"Viagem":"Aqui"}`;
    $("#ovTot").textContent="Total "+brl(total)+(depois?(ac?" · acrescentado na conta "+ac.nums:" · A COBRAR")+(nome?" ("+nome+")":""):nSplit?" · dividido em "+nSplit:(rec?(troco>=0?" · Troco "+brl(troco):" · Falta "+brl(-troco)):""));
    $("#ovFichas").innerHTML=(hasP||hasB?`<div class="ficha"><b>${pad(n)} · Bandeja${fc}</b>${hasP?`<div>${esc(fmtItems(pastel))}</div>`:""}${hasB?`<div>Bebida: ${esc(fmtItems(bebida))}</div>`:""}<div class="hint">A bandeja entrega ${hasP&&hasB?"pastel e bebida":hasP?"o pastel":"a bebida"}</div></div>`:"")
      +(hasC?`<div class="ficha"><b>${pad(n)} · Caldo${fc}</b><div>${esc(fmtItems(caldo))}</div><div class="hint">Vai para o caldo</div></div>`:"");
    $("#ov").hidden=false; $("#ovClose").focus();
  }catch(err){toast(err&&err.code==="quota_exceeded"?"O sistema atingiu o limite de pedidos guardados. Avise o Erick.":"Não deu para registrar. Toque em Finalizar de novo.")}
  busy=false; renderCart();
});
$("#ovClose").addEventListener("click",()=>{$("#ov").hidden=true});

/* ---------- fritura: lotes com pedidos inteiros ---------- */
/* ordem da fila = número do pedido (dado pelo servidor), não a hora do celular, que pode estar adiantada ou atrasada;
   acréscimo vem logo depois do pedido original */
function pendingPastel(){return orders.filter(o=>!o.pastelDone&&sum(o.pastel)>0).sort(fila)}
/* Cada fritada começa SEMPRE pelo pedido mais antigo da fila; depois completa o espaço
   que sobra com pedidos seguintes que caibam inteiros. Assim um pedido pequeno pode
   adiantar, mas o mais antigo nunca espera mais de uma fritada. */
function makeLots(list,cap){
  const rest=[...list],lots=[];
  while(rest.length){
    const lot=[];let tot=0;
    for(let i=0;i<rest.length;){
      const n=sum(rest[i].pastel);
      if(!lot.length||tot+n<=cap){lot.push(rest[i]);tot+=n;rest.splice(i,1)}else i++;
    }
    lots.push(lot);
  }
  return lots;
}
function lotCounts(lot){const c={};lot.forEach(o=>Object.entries(o.pastel).forEach(([f,q])=>{c[f]=(c[f]||0)+q}));return c}
function stockAlerts(){
  const out=[],low=[];
  cfg.pastel.forEach(it=>{const r=remaining(it.n);if(r===null)return;if(r<=0)out.push(it.n);else if(r<=cfg.lowAt)low.push([it.n,r])});
  if(!out.length&&!low.length)return "";
  return `<div class="alerts">${out.map(f=>`<span class="al out">${esc(f)}: acabou</span>`).join("")}${low.map(([f,r])=>`<span class="al low">${esc(f)}: restam ${r}</span>`).join("")}</div>`;
}
/* Fritura sem toques e por pedido: cada pedido é um quadro próprio, na ordem de chegada.
   Nada se junta e a ordem nunca muda; pedidos entregues apenas saem do topo.
   Uma linha marca até onde cabe uma leva no fogo (capacidade). */
/* Quem frita toca em "Coloquei no óleo" e o pedido sai da fila dele (campo oleo).
   Plano B: quando a bandeja marca Entregue, o pedido também sai da fritura. */
let lastOleo=null;
function renderFritura(){
  const all=pendingPastel(),list=all.filter(o=>!o.oleo),oil=all.filter(o=>o.oleo).sort((a,b)=>(b.oleoAt||0)-(a.oleoAt||0)),alerts=stockAlerts();
  if(lastOleo&&!all.some(o=>o.id===lastOleo.id))lastOleo=null;
  const undo=lastOleo?`<div class="undo"><span>Pedido ${pad(lastOleo.num)} foi para o óleo.</span><button type="button" data-desoleo="${esc(lastOleo.id)}">Desfazer</button></div>`:"";
  const oilBox=oil.length?`<div class="oilbox"><div class="label">No óleo agora · ${oil.length} pedido${oil.length===1?"":"s"} (saem daqui quando a bandeja entregar)</div>${oil.map(o=>`<div class="oilrow"><span class="num">${pad(o.num)}</span><span class="it">${esc(fmtItems(o.pastel))}</span><button type="button" data-desoleo="${esc(o.id)}">Voltar para a fila</button></div>`).join("")}</div>`:"";
  if(!list.length){$("#lots").innerHTML=alerts+undo+`<div class="idle"><strong>Nenhum pastel para fritar</strong>${oil.length?"Tudo o que chegou já está no óleo.":"Quando o caixa registrar um pedido, ele aparece aqui."}</div>`+oilBox;return}
  let acc=0,cut=false,html="";
  list.forEach((o,i)=>{
    const q=sum(o.pastel);
    if(!cut&&i>0&&acc+q>cfg.capacity){cut=true;html+=`<div class="fogo-cheio"><span>Fogo cheio · ${acc} de ${cfg.capacity}</span><small>Os pedidos abaixo vão na próxima leva</small></div>`}
    if(!cut)acc+=q;
    const items=Object.entries(o.pastel).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([f,n])=>`<div class="fl"><span class="n">${n}</span><span class="s">${esc(f).replace(/\//g,"/<wbr>")}</span></div>`).join("");
    html+=`<div class="pcard${cut?" later":""}"><div class="pc-head"><span class="pc-num">${pad(o.num)} ${consTag(o)}${acTag(o)}</span><span class="total">${q} ${q===1?"pastel":"pastéis"}${q>cfg.capacity?' <span style="color:var(--warn)">· maior que o fogo</span>':""}</span></div><div class="flav">${items}</div><button type="button" class="fry-in" data-oleo="${esc(o.id)}">Coloquei no óleo</button></div>`;
  });
  const tot=list.reduce((a,o)=>a+sum(o.pastel),0);
  $("#lots").innerHTML=alerts+undo+`<p class="muted" style="margin:0 0 10px">${list.length} pedido${list.length===1?"":"s"} para fritar · ${tot} pastéis</p>`+html+oilBox;
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-oleo]");
  if(b&&db){const o=orders.find(x=>x.id===b.dataset.oleo);if(!o)return;b.disabled=true;
    try{await db.doc("orders/"+o.id).update({oleo:true,oleoAt:Date.now()});lastOleo={id:o.id,num:o.num}}catch(err){b.disabled=false;toast("Não salvou. Toque de novo.")}
    render();return}
  const u=e.target.closest("[data-desoleo]");
  if(u&&db){const o=orders.find(x=>x.id===u.dataset.desoleo);if(!o)return;u.disabled=true;
    try{await db.doc("orders/"+o.id).update({oleo:false});if(lastOleo&&lastOleo.id===o.id)lastOleo=null}catch(err){u.disabled=false;toast("Não salvou. Toque de novo.")}
    render()}
});
/* ---------- bandeja e caldo ---------- */
const lastUndo={bandeja:null,caldo:null};
/* Bandeja: um quadradinho por pastel/bebida; o caixa da bandeja marca o que já entregou (campo ent).
   Quando tudo está marcado, o pedido sai como entregue. */
const entKey=(k,f)=>(k==="bebida"?"b|":"p|")+f;
/* ordem fixa = ordem do cardápio (o banco não guarda a ordem dos sabores, então sem isso os quadradinhos trocam de lugar) */
const menuPos=(k,f)=>{const i=(cfg[k]||[]).findIndex(x=>x.n===f);return i<0?999:i};
function entUnits(o){const ent=o.ent||{},u=[];
  [["pastel",o.pastel],["bebida",o.bebida]].forEach(([k,obj])=>Object.entries(obj||{}).sort((a,b)=>menuPos(k,a[0])-menuPos(k,b[0])||a[0].localeCompare(b[0])).forEach(([f,q])=>{q=+q||0;if(q>0){const key=entKey(k,f),on=entSet(ent[key],q);u.push({k,f,q,key,on,d:on.size})}}));
  return u}
/* quais quadradinhos estão marcados: lista de posições (versão antiga guardava só a quantidade) */
/* Caldo: uma linha por copo/garrafa, com quantidade, tamanho e sabores separados ("1 Litro + Maracujá") */
function caldoBlock(o){
  const l=Object.entries(o.caldo||{}).filter(([,q])=>+q>0).sort((a,b)=>menuPos("caldo",a[0].split(" + ")[0])-menuPos("caldo",b[0].split(" + ")[0])||a[0].localeCompare(b[0]));
  return `<div class="cd-list">${l.map(([k,q])=>{const [tam,...sab]=k.split(" + ");
    return `<div class="cd"><span class="cd-q">${+q}×</span><span class="cd-t">${esc(tam)}</span>${sab.length?sab.map(x=>`<span class="cd-s">${esc(x)}</span>`).join(""):'<span class="cd-s puro">Puro</span>'}</div>`}).join("")}</div>`}
function unitsBlock(o){const u=entUnits(o),algum=u.some(x=>x.d>0),falta=u.filter(x=>x.d<x.q).map(x=>(x.q-x.d)+"× "+x.f);
  return `<div class="ub-wrap">${u.map(x=>{const ok=x.d>=x.q;return `<span class="ubg${ok?" ok":x.d?" part":""}${x.k==="bebida"?" beb":""}"><button type="button" class="ub-main" data-ent="${esc(o.id)}" data-key="${esc(x.key)}" data-op="+" aria-label="${esc(x.f)}: ${x.d} de ${x.q} entregues. Tocar soma um, segurar marca todos.">${ok?"✓ ":""}${esc(x.f)}<b>${x.d}/${x.q}</b></button>${x.d?`<button type="button" class="ub-minus" data-ent="${esc(o.id)}" data-key="${esc(x.key)}" data-op="-" aria-label="Tirar um ${esc(x.f)}">−</button>`:""}</span>`}).join("")}</div>${algum&&falta.length?`<div class="falta">Falta: ${esc(falta.join(", "))}</div>`:""}`}
/* toque soma 1, "−" tira 1, segurar o sabor marca todos daquele sabor */
async function setEnt(o,key,op){if(!db)return;const u=entUnits(o).find(x=>x.key===key);if(!u)return;
  const n=op==="all"?u.q:op==="-"?Math.max(0,u.d-1):Math.min(u.q,u.d+1);if(n===u.d)return;
  const ent={...(o.ent||{})};ent[key]=n;
  const tudo=entUnits({...o,ent}).every(x=>x.d>=x.q),upd={ent};if(tudo){upd.pastelDone=true;upd.pastelAt=Date.now()}
  o.ent=ent;render();
  try{await db.doc("orders/"+o.id).update(upd);if(tudo){lastUndo.bandeja={id:o.id,num:o.num};render()}}
  catch(err){toast("Não salvou. Toque de novo.")}}
let holdT=null,holdFired=false;
document.addEventListener("pointerdown",e=>{const b=e.target.closest('[data-ent][data-op="+"]');if(!b)return;holdFired=false;clearTimeout(holdT);
  holdT=setTimeout(()=>{const o=orders.find(x=>x.id===b.dataset.ent);if(!o)return;holdFired=true;try{navigator.vibrate&&navigator.vibrate(30)}catch(_){}setEnt(o,b.dataset.key,"all")},600)});
["pointerup","pointercancel","pointerleave"].forEach(t=>document.addEventListener(t,()=>clearTimeout(holdT),true));
document.addEventListener("contextmenu",e=>{if(e.target.closest("[data-ent]"))e.preventDefault()});
document.addEventListener("click",e=>{const b=e.target.closest("[data-ent]");if(!b)return;
  if(holdFired&&b.dataset.op==="+"){holdFired=false;return}
  const o=orders.find(x=>x.id===b.dataset.ent);if(o)setEnt(o,b.dataset.key,b.dataset.op)});
function renderList(kind){
  const isP=kind==="bandeja", field=isP?"pastel":"caldo", doneF=isP?"pastelDone":"caldoDone";
  /* a bandeja entrega pastel e bebida; o caldo só o caldo */
  const has=o=>sum(o[field])>0||(isP&&sum(o.bebida)>0);
  const txt=o=>isP?[fmtItems(o.pastel),sum(o.bebida)?"bebida: "+fmtItems(o.bebida):""].filter(Boolean).join(" · "):fmtItems(o[field]);
  const list=orders.filter(o=>!o[doneF]&&has(o)).sort(fila);
  const el=$(isP?"#listBandeja":"#listCaldo");
  el.innerHTML=list.length?list.map(o=>`<div class="ord"><span class="num">${pad(o.num)}</span><div class="items">${isP&&sum(o.pastel)>0?(o.oleo?'<span class="st oil">no óleo</span>':'<span class="st wait">esperando fritar</span>'):""}${consTag(o)?consTag(o)+" ":""}${acTag(o)}${o.pago===false?'<span class="cons acobrar">A cobrar</span> ':""}${isP?unitsBlock(o):caldoBlock(o)}<div class="meta">Caixa ${esc(o.caixa||"")}</div></div><button class="done" data-done="${kind}" data-id="${esc(o.id)}">Entregue</button></div>`).join("")
    :`<div class="idle"><strong>Tudo entregue</strong>${isP?"Os pedidos de pastel e bebida aparecem aqui na ordem em que foram feitos.":"Os pedidos de caldo aparecem aqui na ordem em que foram feitos."}</div>`;
  const u=$(isP?"#undoBandeja":"#undoCaldo"), last=lastUndo[kind];
  u.hidden=!last; if(last)u.innerHTML=`<span>Pedido ${pad(last.num)} marcado como entregue.</span><button data-undo="${kind}">Desfazer</button>`;
}
document.addEventListener("click",async e=>{
  const d=e.target.closest("[data-done]");
  if(d&&db){const kind=d.dataset.done,id=d.dataset.id,o=orders.find(x=>x.id===id);if(!o)return;
    d.disabled=true;const f=kind==="bandeja"?"pastelDone":"caldoDone";
    try{await db.doc("orders/"+id).update({[f]:true,[f.replace("Done","At")]:Date.now()});lastUndo[kind]={id,num:o.num}}catch(err){d.disabled=false;toast("Não salvou. Toque em Entregue de novo.")}
    render();return}
  const u=e.target.closest("[data-undo]");
  if(u&&db){const kind=u.dataset.undo,last=lastUndo[kind];if(!last)return;const f=kind==="bandeja"?"pastelDone":"caldoDone";
    try{await db.doc("orders/"+last.id).update({[f]:false});lastUndo[kind]=null}catch(err){toast("Não deu para desfazer. Tente de novo.")}
    render()}
});

/* ---------- ajustes ---------- */
/* ---------- estoque ---------- */
/* Estoque: cada feira (terça, sexta, domingo) tem um padrão em config/estoque.
   O estoque do dia é o ajuste salvo em stock/<dia> ou, se não houver, o padrão da feira do dia. */
const FEIRAS={terca:"terça",sexta:"sexta",domingo:"domingo"};
const feiraDoDia=()=>({2:"terca",5:"sexta",0:"domingo"})[new Date().getDay()]||"";
let stockDoc=null,templates={},tplSel=feiraDoDia()||"terca";
const feiraHoje=()=>stockDoc&&FEIRAS[stockDoc.feira]?stockDoc.feira:feiraDoDia();
function computeStock(){const f=feiraHoje(),t=f&&templates[f];
  stock=stockDoc&&stockDoc.counts&&typeof stockDoc.counts==="object"?stockDoc.counts:(t&&typeof t==="object"?t:{})}
const inList=id=>document.activeElement&&document.activeElement.closest&&document.activeElement.closest(id);
function renderEstoque(){
  const f=feiraHoje(),ajustado=!!(stockDoc&&stockDoc.counts),temPadrao=!!(f&&templates[f]&&Object.keys(templates[f]).length);
  $("#estInfo").textContent=!f?"Hoje não é terça, sexta nem domingo. Escolha a feira ao lado para usar o estoque padrão dela."
    :ajustado?`Feira de ${FEIRAS[f]} · com ajuste feito hoje.`:temPadrao?`Feira de ${FEIRAS[f]} · usando o estoque padrão.`:`Feira de ${FEIRAS[f]} · essa feira ainda não tem estoque padrão. Cadastre lá embaixo.`;
  document.querySelectorAll("#feiraHoje [data-fh]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.fh===f));
  $("#stPadrao").hidden=!ajustado||!f;if(f)$("#stPadrao").textContent=`Voltar para o padrão de ${FEIRAS[f]}`;
  if(!inList("#stockList"))$("#stockList").innerHTML=cfg.pastel.length?cfg.pastel.map((it,i)=>{
    const has=Object.prototype.hasOwnProperty.call(stock,it.n),sold=soldToday(it.n),r=remaining(it.n);
    const cls=r===null?"":r<=0?" out":r<=cfg.lowAt?" low":"";
    const info=has?`${sold} vendidos · <b style="font-size:16px">${r<=0?"acabou":"restam "+r}</b>`:`${sold} vendidos · sem controle`;
    return `<label class="srow${cls}" for="st${i}"><b>${esc(it.n)}</b><input id="st${i}" data-f="${esc(it.n)}" type="number" min="0" max="5000" inputmode="numeric" placeholder="—" value="${has?esc(stock[it.n]):""}"><span class="hint">${info}</span></label>`;
  }).join(""):'<div class="empty">Cadastre os pastéis em Ajustes primeiro.</div>';
  document.querySelectorAll("#tplSel [data-tp]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.tp===tplSel));
  $("#tplSave").textContent=`Salvar padrão de ${FEIRAS[tplSel]}`;
  if(!inList("#tplList")){const t=templates[tplSel]||{};
    $("#tplList").innerHTML=cfg.pastel.map((it,i)=>{const has=Object.prototype.hasOwnProperty.call(t,it.n);
      return `<label class="srow" for="tp${i}"><b>${esc(it.n)}</b><input id="tp${i}" data-f="${esc(it.n)}" type="number" min="0" max="5000" inputmode="numeric" placeholder="—" value="${has?esc(t[it.n]):""}"><span class="hint">${has?"padrão de "+FEIRAS[tplSel]:"sem controle"}</span></label>`}).join("")}
}
const readCounts=sel=>{const c={};document.querySelectorAll(sel+" input").forEach(inp=>{const v=inp.value.trim();if(v!=="")c[inp.dataset.f]=Math.max(0,parseInt(v,10)||0)});return c};
$("#stockForm").addEventListener("submit",async e=>{
  e.preventDefault(); if(!db){toast("Sem conexão: não dá para salvar agora.");return}
  try{await db.doc("stock/"+today()).set({day:today(),feira:feiraHoje(),counts:readCounts("#stockList")});document.activeElement.blur();toast("Estoque de hoje salvo. O caixa e a fritura já veem os números.")}catch(err){toast("Não salvou. Tente de novo.")}
});
$("#feiraHoje").addEventListener("click",async e=>{const b=e.target.closest("[data-fh]");if(!b||!db)return;const f=b.dataset.fh;
  if(f===feiraHoje())return;
  try{await db.doc("stock/"+today()).set({day:today(),feira:f});toast(`Hoje usa o estoque padrão de ${FEIRAS[f]}.`)}catch(err){toast("Não salvou. Tente de novo.")}});
$("#stPadrao").addEventListener("click",async()=>{const f=feiraHoje();if(!db||!f)return;
  try{await db.doc("stock/"+today()).set({day:today(),feira:f});toast(`Voltou para o padrão de ${FEIRAS[f]}.`)}catch(err){toast("Não salvou. Tente de novo.")}});
$("#tplSel").addEventListener("click",e=>{const b=e.target.closest("[data-tp]");if(!b)return;tplSel=b.dataset.tp;if(document.activeElement)document.activeElement.blur();renderEstoque()});
$("#tplForm").addEventListener("submit",async e=>{
  e.preventDefault(); if(!db){toast("Sem conexão: não dá para salvar agora.");return}
  const all={};Object.keys(FEIRAS).forEach(k=>{if(templates[k])all[k]=templates[k]});all[tplSel]=readCounts("#tplList");
  try{await db.doc("config/estoque").set(all);document.activeElement.blur();toast(`Padrão de ${FEIRAS[tplSel]} salvo.`)}catch(err){toast("Não salvou. Tente de novo.")}
});

/* ---------- resumo diário: dias passados viram 1 registro em daily/<dia> ---------- */
const dstr=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dparse=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
/* ---------- fechamento do dia ---------- */
function fechInputSet(id,cents){const el=$("#"+id);if(el)el.value=cents?brl(cents/100):""}
function fechCalc(){
  const f=gData.fech||{},din=Math.round((gData.din||0)*100),fundo=f.fundo||0,cont=f.contado||0;
  const esp=fundo+din,dif=cont-esp;
  $("#fcEsp").textContent=brl(esp/100);
  const el=$("#fcDif");
  if(!cont){el.textContent="Digite o dinheiro contado para conferir.";el.className="fc-dif";return}
  el.textContent=dif===0?"Bateu certinho":dif>0?`Sobrando ${brl(dif/100)}`:`Faltando ${brl(-dif/100)}`;
  el.className="fc-dif "+(dif===0?"ok":dif>0?"mais":"menos");
}
let fechSaveT=null;
function fechSave(){clearTimeout(fechSaveT);fechSaveT=setTimeout(async()=>{if(!db||!gData)return;const k=dstr(gData.r.start),f=gData.fech||{};
  try{await db.doc("fechamento/"+k).set({day:k,fundo:f.fundo||0,contado:f.contado||0})}catch(e){toast("Não salvou a conferência. Tente de novo.")}},600)}
function renderFechamento(){
  const ae=document.activeElement;if(ae&&ae.tagName==="INPUT"&&ae.closest&&ae.closest("#gBody"))return;
  const k=dstr(gData.r.start);let s;
  if(k===today()){s=emptySum(k);allOrders.forEach(o=>addOrder(s,o))}else s=gData.days[k]||null;
  if(!s||!s.orders){$("#gBody").innerHTML=`<div class="idle"><strong>Nenhuma venda neste dia</strong>${gOff===0?"As vendas de hoje aparecem aqui assim que o caixa registrar pedidos.":"Use as setas para ver outro dia."}</div>`;return}
  const hasPay=s.dinheiro!==undefined,din=r2(s.dinheiro),aRec=r2(s.aReceber||0),out=r2(s.total-din-aRec);gData.din=din;
  const pq=sum(s.pastel),cq=sum(s.caldo),bq=sum(s.bebida);
  const cx=Object.entries(s.porCaixa||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  $("#gBody").innerHTML=`
    <div class="kpis">
      <div class="kpi"><span class="label">Faturamento do dia</span><span class="v">${brl(s.total)}</span><span class="d">${k===today()?"Hoje, ainda somando":"Dia fechado"}</span></div>
      <div class="kpi"><span class="label">Pedidos</span><span class="v">${s.orders}</span><span class="d">Ticket médio ${brl(s.total/s.orders)}${s.consumo?` · ${s.consumo.aqui||0} aqui · ${s.consumo.viagem||0} viagem`:""}${s.cancelados?`<br><span style="color:var(--warn)">${s.cancelados} cancelado${s.cancelados===1?"":"s"} · ${brl(s.canceladosValor)} fora do faturamento</span>`:""}</span></div>
      <div class="kpi"><span class="label">Vendidos</span><span class="v">${pq} <span style="font-size:18px">pastéis</span></span><span class="d">${cq} caldo${cq===1?"":"s"} · ${bq} bebida${bq===1?"":"s"}</span></div>
    </div>
    <div class="two">
      <div class="panel"><h3>Por forma de pagamento</h3>
        ${hasPay?`<div class="sub">Conta como dinheiro o pedido em que o caixa digitou o valor recebido ou tocou nas notas.</div>
        <div class="fc-row"><span>Dinheiro</span><b>${brl(din)}</b></div>
        <div class="fc-row"><span>Pix, cartão ou sem registro</span><b>${brl(out)}</b></div>
        ${aRec?`<div class="fc-row" style="color:var(--warn)"><span>Ainda não pago (a cobrar)</span><b>${brl(aRec)}</b></div>`:""}
        <div class="fc-row muted"><span>Troco devolvido</span><span>${brl(s.troco||0)}</span></div>`
        :`<div class="sub">Este dia foi fechado antes de o sistema separar as formas de pagamento.</div>`}
      </div>
      <div class="panel"><h3>Por caixa</h3>
        ${cx.length?cx.map(([n,c])=>`<div class="fc-row"><span>Caixa ${esc(n)} <small class="muted">· ${c.orders} pedido${c.orders===1?"":"s"}</small></span><b>${brl(c.total)}</b></div><div class="fc-sub">em dinheiro: ${brl(c.dinheiro)}</div>`).join("")
          :`<div class="sub">Sem separação por caixa neste dia.</div>`}
      </div>
    </div>
    ${hasPay?`<div class="panel"><h3>Conferência da gaveta</h3>
      <div class="sub">Some o fundo de troco do começo do dia com o que entrou em dinheiro e compare com o que tem na gaveta. Fica salvo para este dia.</div>
      <div class="fc-grid">
        <label for="fcFundo">Fundo de troco (início do dia)<input id="fcFundo" data-fc="fundo" inputmode="numeric" autocomplete="off" placeholder="R$ 0,00"></label>
        <label for="fcContado">Dinheiro contado na gaveta<input id="fcContado" data-fc="contado" inputmode="numeric" autocomplete="off" placeholder="R$ 0,00"></label>
      </div>
      <div class="fc-row"><span>Deveria ter na gaveta</span><b id="fcEsp"></b></div>
      <div class="fc-dif" id="fcDif"></div>
    </div>`:""}
    <div class="panel"><h3>O que saiu no dia</h3><div class="sub">Pastéis por sabor.</div>${rankHTML(s.pastel,"un")}</div>
    <div class="two">
      <div class="panel"><h3>Caldo de cana</h3><div class="sub">Por tamanho, com os sabores embaixo.</div>${caldoRankHTML(s.caldo)}</div>
      <div class="panel"><h3>Bebidas</h3>${rankHTML(s.bebida,"un")}</div>
    </div>`;
  if(hasPay){const f=gData.fech||{};fechInputSet("fcFundo",f.fundo);fechInputSet("fcContado",f.contado);fechCalc()}
}
document.addEventListener("input",e=>{const el=e.target;if(!el.dataset||!el.dataset.fc||!gData)return;
  const dig=el.value.replace(/\D/g,"").replace(/^0+/,"").slice(0,8),c=dig?parseInt(dig,10):0;
  el.value=dig?brl(c/100):"";try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}
  gData.fech=gData.fech||{};gData.fech[el.dataset.fc]=c;fechCalc();fechSave()});

let archiving=false;
async function archivePast(){
  if(!db||archiving)return; archiving=true;
  try{
    const snap=await db.collection("orders").where("day","<",today()).get();
    const byDay={};snap.docs.forEach(d=>{const o=d.data();(byDay[o.day]=byDay[o.day]||[]).push({id:d.id,...o})});
    for(const [day,list] of Object.entries(byDay)){
      const ref=db.doc("daily/"+day);
      const lease=await ref.acquire({holder:deviceId,ttlMs:20000}); if(!lease.acquired)continue;
      const cur=await ref.get(); const s=cur.exists?{...emptySum(day),...cur.data()}:emptySum(day);
      const done=new Set(Array.isArray(s.ids)?s.ids:[]);
      s.pastel={...s.pastel};s.caldo={...s.caldo};s.bebida={...s.bebida};s.porCaixa=JSON.parse(JSON.stringify(s.porCaixa||{}));if(!cur.exists){s.dinheiro=0;s.troco=0}
      list.forEach(o=>{if(!done.has(o.id)){addOrder(s,o);done.add(o.id)}});
      s.ids=[...done];
      await ref.set(s);                 /* primeiro salva o resumo… */
      for(const o of list){try{await db.doc("orders/"+o.id).delete()}catch(e){}}   /* …depois apaga os pedidos */
    }
  }catch(e){}
  archiving=false;
}

/* ---------- gerente ---------- */
const DOW=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
let gPer="dia",gOff=0,gData=null,gLoading=false,gReq=0;
function periodRange(per,off){
  const t=dparse(today());
  if(per==="dia"){const d=addD(t,off);return {start:d,end:d}}
  if(per==="semana"){const mon=addD(t,-((t.getDay()+6)%7)+off*7);return {start:mon,end:addD(mon,6)}}
  const s=new Date(t.getFullYear(),t.getMonth()+off,1);return {start:s,end:new Date(s.getFullYear(),s.getMonth()+1,0)};
}
function periodLabel(per,r){
  if(per==="dia")return DOW[r.start.getDay()]+" "+String(r.start.getDate()).padStart(2,"0")+"/"+String(r.start.getMonth()+1).padStart(2,"0")+(dstr(r.start)===today()?" · hoje":"");
  if(per==="mes")return MES[r.start.getMonth()]+" "+r.start.getFullYear();
  const f=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0");
  return f(r.start)+" a "+f(r.end);
}
document.querySelector("#gPer").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;gPer=b.dataset.p;gOff=0;
  document.querySelectorAll("#gPer button").forEach(x=>x.setAttribute("aria-pressed",x===b));loadReport()});
$("#gPrev").addEventListener("click",()=>{gOff--;loadReport()});
$("#gNext").addEventListener("click",()=>{if(gOff<0){gOff++;loadReport()}});
async function loadReport(){
  const r=periodRange(gPer,gOff),pr=periodRange(gPer,gOff-1);
  $("#gLabel").textContent=periodLabel(gPer,r); $("#gNext").disabled=gOff>=0;
  if(!db){$("#gBody").innerHTML='<div class="idle"><strong>Sem conexão</strong>O relatório precisa do sistema no ar.</div>';return}
  const req=++gReq; gLoading=true;
  if(!gData)$("#gBody").innerHTML='<div class="idle"><strong>Carregando relatório</strong>Somando as vendas do período…</div>';
  try{
    await archivePast();
    const snap=await db.collection("daily").where("day",">=",dstr(pr.start)).where("day","<=",dstr(r.end)).get();
    if(req!==gReq)return;
    const days={};snap.docs.forEach(d=>{const x=d.data();if(x&&x.day)days[x.day]=x});
    let fech=null;if(gPer==="dia"){try{const fs=await db.doc("fechamento/"+dstr(r.start)).get();if(fs.exists){const d=fs.data();fech={fundo:+d.fundo||0,contado:+d.contado||0}}}catch(e){}}
    if(req!==gReq)return;
    gData={r,pr,days,fech:fech||{}};
  }catch(e){if(req===gReq)$("#gBody").innerHTML='<div class="idle"><strong>Não deu para carregar</strong>Confira a conexão e toque em Gerente de novo.</div>';gLoading=false;return}
  gLoading=false; renderGerente();
}
function sumRange(start,end){
  const tot=emptySum(""),perDay=[];let active=0;
  for(let d=new Date(start);d<=end;d=addD(d,1)){
    const k=dstr(d);let s=gData.days[k]||null;
    if(k===today()){s=emptySum(k);allOrders.forEach(o=>addOrder(s,o))}
    const p=s?sum(s.pastel):0;
    perDay.push({day:k,date:new Date(d),orders:s?s.orders:0,total:s?+s.total||0:0,pastel:p});
    if(s&&s.orders>0){active++;tot.orders+=s.orders;tot.total+=+s.total||0;addTo(tot.pastel,s.pastel);addTo(tot.caldo,s.caldo);addTo(tot.bebida,s.bebida)}
  }
  tot.total=Math.round(tot.total*100)/100;tot.active=active;tot.perDay=perDay;tot.pastelQty=sum(tot.pastel);return tot;
}
function delta(cur,prev,label){
  if(!prev)return cur?`<span class="d">Sem vendas no período anterior</span>`:`<span class="d">&nbsp;</span>`;
  const pc=Math.round((cur-prev)/prev*100);
  return `<span class="d ${pc>0?"up":pc<0?"down":""}">${pc>0?"▲ +":pc<0?"▼ ":""}${pc}% vs ${label}</span>`;
}
function rankHTML(obj,unit){
  const e=Object.entries(obj).sort((a,b)=>b[1]-a[1]);if(!e.length)return '<div class="empty">Nada vendido no período.</div>';
  const max=e[0][1],t=e.reduce((a,[,q])=>a+q,0);
  return `<div class="rank">${e.map(([n,q])=>`<div class="rk"><span class="nm">${esc(n)}</span><span class="tr"><span class="fill" style="width:${Math.max(2,q/max*100)}%;display:block"></span></span><span class="qt"><b>${q}</b> ${unit} · ${Math.round(q/t*100)}%</span></div>`).join("")}</div>`;
}
/* Caldo agrupado por tamanho, com os sabores embaixo ("Puro 3 · Limão 2") */
function caldoRankHTML(obj){
  const g={};Object.entries(obj||{}).forEach(([k,q])=>{q=+q||0;if(!q)return;const [tam,...sab]=k.split(" + ");const x=g[tam]=g[tam]||{q:0,s:{}};x.q+=q;const nm=sab.length?sab.join(" + "):"Puro";x.s[nm]=(x.s[nm]||0)+q});
  const e=Object.entries(g).sort((a,b)=>b[1].q-a[1].q);if(!e.length)return '<div class="empty">Nada vendido no período.</div>';
  const max=e[0][1].q,t=e.reduce((a,[,x])=>a+x.q,0);
  return `<div class="rank">${e.map(([n,x])=>`<div class="rk"><span class="nm">${esc(n)}</span><span class="tr"><span class="fill" style="width:${Math.max(2,x.q/max*100)}%;display:block"></span></span><span class="qt"><b>${x.q}</b> un · ${Math.round(x.q/t*100)}%</span><div class="rk-sub">${Object.entries(x.s).sort((a,b)=>b[1]-a[1]).map(([sn,sq])=>`${esc(sn)} <b>${sq}</b>`).join(" · ")}</div></div>`).join("")}</div>`;
}
function renderGerente(){
  if(!gData||gLoading&&!gData)return;
  if(gPer==="dia"){renderFechamento();return}
  const {r,pr}=gData,c=sumRange(r.start,r.end),p=sumRange(pr.start,pr.end);
  const lbl=gPer==="semana"?"semana anterior":"mês anterior";
  if(!c.orders){
    $("#gBody").innerHTML=`<div class="idle"><strong>Nenhuma venda neste período</strong>${gOff===0?"As vendas aparecem aqui assim que o caixa registrar pedidos.":"Use as setas para ver outro período."}</div>`;return}
  const avg=c.active?Math.round(c.pastelQty/c.active):0,pavg=p.active?Math.round(p.pastelQty/p.active):0;
  const ticket=c.orders?c.total/c.orders:0;
  const max=Math.max(1,...c.perDay.map(d=>d.pastel));
  const isW=gPer==="semana";
  const cols=c.perDay.map((d,i)=>`<div class="col${d.day===today()?" today":""}" tabindex="0" data-i="${i}"><div class="bar" style="height:${d.pastel/max*100}%"></div></div>`).join("");
  const xl=c.perDay.map(d=>{const dd=d.date.getDate();return `<span>${isW?DOW[d.date.getDay()]:(dd===1||dd%5===0?dd:"")}</span>`}).join("");
  $("#gBody").innerHTML=`
    <div class="kpis">
      <div class="kpi"><span class="label">Faturamento</span><span class="v">${brl(c.total)}</span>${delta(c.total,p.total,lbl)}</div>
      <div class="kpi"><span class="label">Pastéis vendidos</span><span class="v">${c.pastelQty}</span>${delta(c.pastelQty,p.pastelQty,lbl)}</div>
      <div class="kpi"><span class="label">Média por dia de venda</span><span class="v">${avg} <span style="font-size:18px">pastéis</span></span><span class="d">${c.active} dia${c.active===1?"":"s"} com venda${pavg?` · antes: ${pavg}`:""}</span></div>
      <div class="kpi"><span class="label">Pedidos</span><span class="v">${c.orders}</span><span class="d">Ticket médio ${brl(ticket)}</span></div>
    </div>
    <div class="panel">
      <h3>Pastéis por dia</h3><div class="sub">Passe o dedo ou o mouse numa barra para ver o faturamento do dia.${c.perDay.some(d=>d.day===today())?" Hoje aparece em cinza e ainda está somando.":""}</div>
      <div class="chart" id="gChart" style="grid-template-columns:repeat(${c.perDay.length},minmax(0,1fr))"><span class="ymax">${max}</span>${cols}</div>
      <div class="xl" style="grid-template-columns:repeat(${c.perDay.length},minmax(0,1fr))">${xl}</div>
    </div>
    <div class="panel"><h3>Sabores mais vendidos</h3><div class="sub">Quantidade de pastéis no período e a parte de cada sabor no total.</div>${rankHTML(c.pastel,"un")}</div>
    <div class="two">
      <div class="panel"><h3>Caldo de cana</h3><div class="sub">Por tamanho, com os sabores embaixo.</div>${caldoRankHTML(c.caldo)}</div>
      <div class="panel"><h3>Bebidas</h3><div class="sub">Unidades vendidas.</div>${rankHTML(c.bebida,"un")}</div>
    </div>`;
  const tip=document.createElement("div");tip.className="tip";tip.hidden=true;$("#gBody").appendChild(tip);
  const show=(el,x,y)=>{const d=c.perDay[+el.dataset.i];const f=String(d.date.getDate()).padStart(2,"0")+"/"+String(d.date.getMonth()+1).padStart(2,"0");
    tip.innerHTML=`<b>${DOW[d.date.getDay()]} ${f}</b><br>${d.pastel} pastéis · ${d.orders} pedidos<br>${brl(d.total)}`;tip.hidden=false;
    const w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+"px";tip.style.top=Math.max(8,y-tip.offsetHeight-12)+"px"};
  const ch=$("#gChart");
  ch.addEventListener("pointermove",e=>{const el=e.target.closest(".col");if(el)show(el,e.clientX,e.clientY);else tip.hidden=true});
  ch.addEventListener("pointerleave",()=>tip.hidden=true);
  ch.addEventListener("focusin",e=>{const el=e.target.closest(".col");if(el){const b=el.getBoundingClientRect();show(el,b.left+b.width/2,b.top+20)}});
  ch.addEventListener("focusout",()=>tip.hidden=true);
}

/* ---------- zerar o dia ---------- */
let resetting=false;
function renderReset(){
  const n=allOrders.length;
  $("#resetInfo").textContent=resetting?"Apagando…":(n?`Hoje tem ${n} pedido${n===1?"":"s"} registrado${n===1?"":"s"}.`:"Nenhum pedido registrado hoje.");
  $("#btnReset").disabled=!db||resetting||!n;
}
$("#btnReset").addEventListener("click",()=>{$("#resetConfirm").hidden=false;$("#btnReset").hidden=true;$("#btnResetYes").focus()});
$("#btnResetNo").addEventListener("click",()=>{$("#resetConfirm").hidden=true;$("#btnReset").hidden=false});
$("#btnResetYes").addEventListener("click",async()=>{
  if(!db||resetting)return; resetting=true; $("#resetConfirm").hidden=true; $("#btnReset").hidden=false; renderReset();
  const day=today(); let fail=0;
  try{
    const snap=await db.collection("orders").where("day","==",day).get();
    for(const d of snap.docs){try{await db.doc("orders/"+d.id).delete()}catch(e){fail++}}
    const ref=db.doc("counters/"+day);
    for(let i=0;i<15;i++){const r=await ref.acquire({holder:deviceId,ttlMs:4000});if(r.acquired){await ref.set({n:0,day,lots:{}});break}await new Promise(r=>setTimeout(r,200))}
    lastUndo.bandeja=null;lastUndo.caldo=null;
    toast(fail?`Faltou apagar ${fail} pedido(s). Toque em Zerar de novo.`:"Pedidos de hoje apagados. O próximo será o 001.");
  }catch(e){toast("Não deu para zerar. Confira a conexão e tente de novo.")}
  resetting=false; render();
});

const toLines=l=>l.map(x=>x.n+" = "+x.p.toFixed(2).replace(".",",")+(x.d?" | "+x.d:"")).join("\n");
/* cadastro do cardápio: uma linha por item, com nome, preço e (no pastel) recheio */
let draft={pastel:[],caldo:[],bebida:[],csabor:[]},cfgDirty=false;
const priceTxt=p=>p?(+p).toFixed(2).replace(".",","):"";
function renderMenu(kind){
  const ph={pastel:"Ex.: Carne",caldo:"Ex.: 500 ml",bebida:"Ex.: Coca lata",csabor:"Ex.: Limão"}[kind];
  $("#rows-"+kind).innerHTML=draft[kind].map((it,i)=>{const id=`m-${kind}-${i}`;return `<div class="mrow">
    <label for="${id}-n">Nome<input id="${id}-n" data-m="${kind}" data-i="${i}" data-f="n" value="${esc(it.n)}" placeholder="${ph}" autocomplete="off"></label>
    ${kind==="csabor"?"<span></span>":`<label for="${id}-p">Preço (R$)<input id="${id}-p" data-m="${kind}" data-i="${i}" data-f="p" value="${esc(it.pt)}" placeholder="0,00" inputmode="decimal" autocomplete="off"></label>`}
    <button type="button" class="rm" data-rm="${kind}" data-i="${i}">Remover</button>
    ${kind==="pastel"?`<label class="full" for="${id}-d">O que vai dentro<input id="${id}-d" data-m="${kind}" data-i="${i}" data-f="d" value="${esc(it.d)}" placeholder="Ex.: carne moída, cebola e azeitona" autocomplete="off"></label>`:""}
  </div>`}).join("")||'<div class="empty">Nenhum item.</div>';
}
function fillCfgForm(){
  if(cfgDirty)return;
  ["pastel","caldo","bebida"].forEach(k=>{draft[k]=cfg[k].map(x=>({n:x.n,pt:priceTxt(x.p),d:x.d||""}));renderMenu(k)});
  draft.csabor=cfg.caldoSabores.map(x=>({n:x.n,pt:"",d:""}));renderMenu("csabor");
  $("#cfgCap").value=cfg.capacity;$("#cfgLow").value=cfg.lowAt;
}
$("#cfgForm").addEventListener("input",e=>{cfgDirty=true;const t=e.target;if(t.dataset.m){const it=draft[t.dataset.m][+t.dataset.i];if(it)it[t.dataset.f==="p"?"pt":t.dataset.f]=t.value}});
$("#cfgForm").addEventListener("click",e=>{
  const a=e.target.closest("[data-add]");
  if(a){const k=a.dataset.add;cfgDirty=true;draft[k].push({n:"",pt:"",d:""});renderMenu(k);const el=$(`#m-${k}-${draft[k].length-1}-n`);el&&el.focus();return}
  const r=e.target.closest("[data-rm]");
  if(r){const k=r.dataset.rm;cfgDirty=true;draft[k].splice(+r.dataset.i,1);renderMenu(k)}
});
function parseLines(s){
  const out=[],bad=[];
  s.split("\n").map(x=>x.trim()).filter(Boolean).forEach(line=>{
    const m=line.match(/^(.+?)\s*[=:]\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:\|\s*(.*))?$/i);
    if(!m){bad.push(line);return}
    const n=m[1].trim(),p=parseFloat(m[2].replace(",",".")),d=(m[3]||"").trim();
    if(!out.some(x=>x.n===n))out.push(d?{n,p,d}:{n,p});
  });
  return {out,bad};
}
$("#cfgForm").addEventListener("submit",async e=>{
  e.preventDefault(); if(!db){toast("Sem conexão: não dá para salvar agora.");return}
  const out={},errs=[];
  ["pastel","caldo","bebida"].forEach(k=>{out[k]=[];draft[k].forEach(it=>{
    const n=it.n.trim();if(!n)return;
    const raw=String(it.pt).replace(/r\$\s*/i,"").trim().replace(/\.(?=\d{3}(\D|$))/g,"").replace(",",".");
    const p=parseFloat(raw);
    if(!/^\d+(\.\d{1,2})?$/.test(raw)||!(p>0)){errs.push(`Preço inválido em "${n}". Use o formato 11,50.`);return}
    if(out[k].some(x=>x.n===n)){errs.push(`"${n}" aparece duas vezes.`);return}
    const d=(it.d||"").trim();out[k].push(d?{n,p,d}:{n,p});
  })});
  if(errs.length){toast(errs[0]);return}
  if(!out.pastel.length){toast("Coloque pelo menos um pastel.");return}
  const CS=[];draft.csabor.forEach(it=>{const n=it.n.trim().replace(/\s*\+\s*/g," ");if(n&&!CS.some(x=>x.n===n))CS.push({n})});
  const P={out:out.pastel},C={out:out.caldo},B={out:out.bebida};
  const capacity=Math.max(1,Math.min(60,parseInt($("#cfgCap").value,10)||15));
  const lowAt=Math.max(0,Math.min(100,parseInt($("#cfgLow").value,10)));
  try{await db.doc("config/barraca").set({pastel:P.out,caldo:C.out,bebida:B.out,caldoSabores:CS,capacity,lowAt:isNaN(lowAt)?10:lowAt});cfgDirty=false;document.activeElement&&document.activeElement.blur&&document.activeElement.blur();fillCfgForm();toast("Ajustes salvos para todos os aparelhos.")}catch(err){toast("Não salvou. Tente de novo.")}
});

/* ---------- render geral ---------- */
function render(){
  const n=orders.length;$("#seqInfo").textContent=db?`${n} pedido${n===1?"":"s"} hoje`:"";
  if(view==="caixa"){renderKeys();renderCart();renderCobrar();if(!$("#ovCancel").hidden)renderCancel()}
  if(view==="fritura")renderFritura();
  if(view==="bandeja")renderList("bandeja");
  if(view==="caldo")renderList("caldo");
  if(!$("#v-lock").hidden){renderLock();return}
  if(view==="estoque")renderEstoque();
  if(view==="gerente"&&gData&&!gLoading){const r=periodRange(gPer,gOff);if(today()>=dstr(r.start)&&today()<=dstr(r.end))renderGerente()}
  if(view==="ajustes"){if(!["INPUT","TEXTAREA"].includes(document.activeElement.tagName))fillCfgForm();renderReset()}
}
function setOnline(on,txt){$("#dot").classList.toggle("on",on);$("#statusTxt").textContent=txt;$("#offline").hidden=on}

setCaixa(caixa);
const h=(location.hash||"").slice(1);show(pinnedView||(VIEWS.includes(h)?h:ls.get("cf.view","caixa")));

(async()=>{
  let conexao=null;try{conexao=await iniciarBanco();db=conexao.db}catch(e){console.error(e);db=null}
  $("#btnLogout").addEventListener("click",()=>conexao&&conexao.sair());
  if(conexao&&conexao.descricao)$("#whoAmI").textContent=conexao.descricao;
  dbTried=true;
  if(!db){setOnline(false,"Sem sistema");render();return}
  setOnline(true,"Conectado");
  db.doc("config/pin").onSnapshot(s=>{
    const d=s.exists?s.data():null;
    pinDoc=d&&typeof d.hash==="string"&&typeof d.salt==="string"?d:null;
    if(pinDoc)pinFirst=changingPin?pinFirst:"";
    pinLoaded=true; if(!$("#v-lock").hidden)renderLock();
  },()=>{pinLoaded=true;render()});
  db.doc("config/estoque").onSnapshot(s=>{const d=s.exists?s.data():{};templates={};Object.keys(FEIRAS).forEach(k=>{if(d[k]&&typeof d[k]==="object")templates[k]=d[k]});computeStock();render()},()=>{});
  db.doc("config/barraca").onSnapshot(s=>{
    if(s.exists){const d=s.data();cfg={pastel:normList(d.pastel||d.flavors),caldo:normList(d.caldo),bebida:normList(d.bebida),caldoSabores:normList(d.caldoSabores),capacity:+d.capacity||15,lowAt:Number.isFinite(+d.lowAt)&&d.lowAt!==undefined?+d.lowAt:10}}
    render();
  },()=>{});
  let day=today(),unsub=null,unsubStock=null;
  const sub=()=>{unsub&&unsub();unsubStock&&unsubStock();
    unsubStock=db.doc("stock/"+day).onSnapshot(s=>{stockDoc=s.exists?s.data():null;computeStock();render()},()=>{});
    unsub=db.collection("orders").where("day","==",day).onSnapshot(s=>{
      allOrders=s.docs.map(d=>({id:d.id,...d.data()}));orders=allOrders.filter(o=>!o.cancelado);checkSom(orders);setOnline(true,"Conectado");render();
    },err=>{setOnline(false,"Sem conexão");});};
  sub();
  setTimeout(archivePast,3000);
  if(view==="gerente"&&!isLocked(view))loadReport();
  setInterval(()=>{if(today()!==day){day=today();orders=[];allOrders=[];stockDoc=null;computeStock();prevQ=null;sub()}},60000);
})();
