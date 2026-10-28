/* Modo demonstração: um "banco" que roda inteiro no navegador, com a mesma interface do Firebase
   (doc/collection/where/onSnapshot/newOrder), então as telas funcionam sem saber a diferença.
   Os dados ficam no localStorage deste navegador. Abas abertas ao mesmo tempo conversam por BroadcastChannel,
   então dá para abrir o Caixa numa aba e a Fritura em outra e ver o pedido chegando, como na barraca. */
import { gerarDemo, hoje } from "./dados-demo.js";

const CHAVE = "comanda-feira-demo-v1";
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
if(canal)canal.onmessage=()=>{carregar();avisar()};
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
function escrever(fn){fn();salvar();setTimeout(avisar,0);if(canal)canal.postMessage("mudou")}
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
      escrever(()=>docs.set(path,{...docs.get(path),...clone(d)}))},
    delete:async()=>escrever(()=>docs.delete(path)),
    onSnapshot:cb=>ouvir(()=>cb(snap(path))),
    acquire:async()=>({acquired:true})
  }},
  collection:nome=>qApi(nome,[]),
  /* número do pedido + pedido gravados juntos; relê antes para não repetir número entre abas */
  newOrder:async(path,day,ord)=>{carregar();const d=docs.get(path)||{},n=(+d.n||0)+1,id=novoId();
    escrever(()=>{docs.set(path,{...d,n,day});docs.set("orders/"+id,{...clone(ord),num:n})});return n},
  counter:async(path,day)=>{carregar();const d=docs.get(path)||{},n=(+d.n||0)+1;escrever(()=>docs.set(path,{...d,n,day}));return n}
};

async function restaurar(){
  const seed=await gerarDemo();docs=new Map(Object.entries(seed));salvar();if(canal)canal.postMessage("mudou");
}

export async function conectarDemo(){
  const salvo=carregar();
  /* exemplo novo a cada dia, para o visitante sempre ver uma feira "acontecendo hoje" */
  if(!salvo||salvo.dia!==hoje()||!docs.has("config/barraca"))await restaurar();
  const $=s=>document.querySelector(s);
  const bar=$("#demoBar");if(bar)bar.hidden=false;
  const r=$("#demoReset");if(r)r.addEventListener("click",async()=>{await restaurar();location.reload()});
  const sec=$("#btnLogout");if(sec)sec.textContent="Restaurar dados de exemplo";
  return {db,modo:"demo",descricao:"Modo demonstração: não tem login. Os dados ficam só neste navegador.",
    sair:async()=>{await restaurar();location.reload()}};
}
