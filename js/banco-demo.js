/* Modo demonstração: um "banco" que roda inteiro no navegador, com a mesma interface do Firebase
   (doc/collection/where/onSnapshot/newOrder), então as telas funcionam sem saber a diferença.
   Os dados ficam no localStorage deste navegador. Abas abertas ao mesmo tempo conversam por BroadcastChannel,
   então dá para abrir o Caixa numa aba e a Fritura em outra e ver o pedido chegando, como na barraca. */
import { gerarDemo, hoje } from "./dados-demo.js";

const CHAVE = "comanda-feira-demo-v1", CHAVE_RT = CHAVE + "-roteiro";
let docs = new Map();
const ouvintes = new Set();
const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHAVE) : null;

function carregar(){
  try{const raw=localStorage.getItem(CHAVE);if(!raw)return null;const o=JSON.parse(raw);docs=new Map(Object.entries(o.docs||{}));return o}
  catch(e){return null}
}
function salvar(){
  try{localStorage.setItem(CHAVE,JSON.stringify({dia:hoje(),docs:Object.fromEntries(docs)}))}catch(e){}
}
function avisar(){ouvintes.forEach(f=>{try{f()}catch(e){console.error(e)}})}
/* as abas mandam os dados junto na mensagem (o localStorage demora a aparecer nas outras abas) */
if(canal)canal.onmessage=e=>{const m=e.data||{};
  if(m.docs){docs=new Map(Object.entries(m.docs));avisar()}
  if(m.rt){const f=feitos();m.rt.forEach(n=>f.add(n));guardarFeitos(f)}
  /* a Fritura aberta em outra aba conta como "viu o pedido chegar" */
  const fr=document.querySelector("#v-fritura");if(m.docs&&fr&&!fr.hidden)marcar(2);renderRoteiro()};
else addEventListener("storage",e=>{if(e.key===CHAVE){carregar();avisar()}});

const clone=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
const snap=path=>({id:path.split("/").pop(),exists:docs.has(path),data:()=>clone(docs.get(path))});
const OPS={"==":(a,b)=>a===b,"<":(a,b)=>a<b,"<=":(a,b)=>a<=b,">":(a,b)=>a>b,">=":(a,b)=>a>=b};
function consulta(nome,filtros){
  const pre=nome+"/";
  return {docs:[...docs.keys()].filter(k=>k.startsWith(pre)&&k.split("/").length===2)
    .filter(k=>filtros.every(([f,op,v])=>OPS[op]((docs.get(k)||{})[f],v))).map(snap)};
}
let seq=0;
const novoId=()=>Date.now().toString(36)+(seq++).toString(36)+Math.random().toString(36).slice(2,6);
/* grava, salva e avisa as telas desta aba (logo depois, como uma resposta de rede) e as outras abas */
const espalhar=()=>{if(canal)canal.postMessage({docs:Object.fromEntries(docs)})};
function escrever(fn){fn();salvar();setTimeout(avisar,0);espalhar()}
const ouvir=f=>{ouvintes.add(f);setTimeout(f,0);return()=>ouvintes.delete(f)};

function qApi(nome,filtros){return{
  where:(f,op,v)=>qApi(nome,[...filtros,[f,op,v]]),
  get:async()=>consulta(nome,filtros),
  onSnapshot:cb=>ouvir(()=>cb(consulta(nome,filtros))),
  add:async d=>{const id=novoId();escrever(()=>docs.set(nome+"/"+id,clone(d)));return {id}}
}}

const db={
  doc(path){return{
    get:async()=>snap(path),
    set:async d=>escrever(()=>docs.set(path,clone(d))),
    update:async d=>{if(!docs.has(path))throw Object.assign(new Error("Documento não existe"),{code:"not-found"});
      if(path.startsWith("orders/")&&(d.ent||d.pastelDone===true))marcar(3);
      escrever(()=>docs.set(path,{...docs.get(path),...clone(d)}))},
    delete:async()=>escrever(()=>docs.delete(path)),
    onSnapshot:cb=>ouvir(()=>cb(snap(path))),
    acquire:async()=>({acquired:true})
  }},
  collection:nome=>qApi(nome,[]),
  /* número do pedido + pedido gravados juntos (as outras abas recebem a mudança na hora pelo canal) */
  newOrder:async(path,day,ord)=>{marcar(1);const d=docs.get(path)||{},n=(+d.n||0)+1,id=novoId();
    escrever(()=>{docs.set(path,{...d,n,day});docs.set("orders/"+id,{...clone(ord),num:n})});return n},
  counter:async(path,day)=>{const d=docs.get(path)||{},n=(+d.n||0)+1;escrever(()=>docs.set(path,{...d,n,day}));return n}
};

async function restaurar(vazia=false){
  const seed=await gerarDemo({vazia});docs=new Map(Object.entries(seed));salvar();
  try{localStorage.removeItem(CHAVE_RT)}catch(e){}
  espalhar();
}

/* Roteiro de 1 minuto: cada passo se marca sozinho quando a pessoa faz aquilo
   (1 pedido no caixa, 2 ver a fritura depois do pedido, 3 entregar na bandeja, 4 abrir o gerente) */
function feitos(){try{return new Set(JSON.parse(localStorage.getItem(CHAVE_RT)||"[]"))}catch(e){return new Set()}}
function guardarFeitos(f){try{localStorage.setItem(CHAVE_RT,JSON.stringify([...f]))}catch(e){}}
function marcar(n){const f=feitos();if(f.has(n)||(n===2&&!f.has(1)))return;f.add(n);guardarFeitos(f);
  renderRoteiro();if(canal)canal.postMessage({rt:[...f]})}
function renderRoteiro(){const f=feitos();document.querySelectorAll("#roteiro li[data-rt]").forEach(li=>li.classList.toggle("ok",f.has(+li.dataset.rt)));
  const c=document.querySelector("#rtCont");if(c)c.textContent=f.size>=4?"pronto, você viu tudo!":f.size+" de 4";
  /* no celular os passos mostram só o título; a dica do próximo passo aparece embaixo */
  const d=document.querySelector("#rtDica"),prox=[...document.querySelectorAll("#roteiro li[data-rt]")].find(li=>!f.has(+li.dataset.rt));
  if(d)d.innerHTML=prox?"<b>Agora:</b> "+prox.querySelector("span").innerHTML:"Você passou pelos quatro postos. Fique à vontade para explorar o resto."}

export async function conectarDemo(){
  const salvo=carregar();
  /* exemplo novo a cada dia, para o visitante sempre ver uma feira "acontecendo hoje" */
  if(!salvo||salvo.dia!==hoje()||!docs.has("config/barraca"))await restaurar();
  const $=s=>document.querySelector(s);
  const bar=$("#demoBar");if(bar)bar.hidden=false;
  const r=$("#demoReset");if(r)r.addEventListener("click",async()=>{await restaurar();location.reload()});
  const v=$("#demoVazia");if(v)v.addEventListener("click",async()=>{await restaurar(true);location.reload()});
  /* roteiro: tocar no passo leva para a aba certa; ver a fritura e o gerente marca os passos 2 e 4 */
  const rt=$("#roteiro");
  if(rt){try{if(localStorage.getItem(CHAVE_RT+"-fechado")==="1")rt.open=false}catch(e){}
    rt.addEventListener("toggle",()=>{try{localStorage.setItem(CHAVE_RT+"-fechado",rt.open?"0":"1")}catch(e){}});
    rt.addEventListener("click",e=>{const b=e.target.closest("[data-ir]");if(!b)return;const t=document.querySelector(`#tabs button[data-v="${b.dataset.ir}"]`);if(t)t.click()})}
  const olhar=(id,n)=>{const el=$(id);if(!el)return;const ver=()=>{if(!el.hidden)marcar(n)};new MutationObserver(ver).observe(el,{attributes:true,attributeFilter:["hidden"]});ver()};
  olhar("#v-fritura",2);olhar("#v-gerente",4);
  renderRoteiro();
  const sec=$("#btnLogout");if(sec)sec.textContent="Restaurar dados de exemplo";
  return {db,modo:"demo",descricao:"Modo demonstração: não tem login. Os dados ficam só neste navegador.",
    sair:async()=>{await restaurar();location.reload()}};
}
