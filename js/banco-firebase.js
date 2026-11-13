/* Banco de dados de verdade: Firebase (Authentication + Firestore).
   Monta o objeto "db" com a mesma interface do modo demonstração (banco-demo.js), então as telas não sabem
   qual dos dois estão usando. Os números de pedido saem de uma transação no contador do dia, para que
   dois caixas ao mesmo tempo nunca recebam o mesmo número. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { CARDAPIO_INICIAL } from "./cardapio-inicial.js";
import { conferirVenda } from "./regras.js";

const $=s=>document.querySelector(s);
const msg=(t,err)=>{const m=$("#loginMsg");m.textContent=t;m.classList.toggle("err",!!err)};
const busy=b=>{$("#lgBtn").disabled=b;$("#lgBtn").textContent=b?"Entrando…":"Entrar"};

export function conectarFirebase(firebaseConfig){return new Promise(resolve=>{
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let fs;
try{fs=initializeFirestore(app,{ignoreUndefinedProperties:true,localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(e){fs=initializeFirestore(app,{ignoreUndefinedProperties:true})}

const mapErr=e=>{if(e&&e.code==="resource-exhausted")e.code="quota_exceeded";return e};
const wrap=s=>({id:s.id,exists:s.exists(),data:()=>s.data()});
const wrapQ=s=>({docs:s.docs.map(wrap)});
function qApi(ref,cons){const q=()=>cons.length?query(ref,...cons):ref;return {
  where:(f,op,v)=>qApi(ref,[...cons,where(f,op,v)]),
  get:async()=>wrapQ(await getDocs(q())),
  /* fromCache: os dados vieram só da memória do aparelho, sem falar com o servidor (a tela avisa se demorar) */
  onSnapshot:(cb,err)=>onSnapshot(q(),{includeMetadataChanges:true},s=>cb({...wrapQ(s),fromCache:!!(s.metadata&&s.metadata.fromCache)}),e=>err&&err(e)),
  add:async d=>{try{const r=await addDoc(ref,d);return {id:r.id}}catch(e){throw mapErr(e)}}
}}
const db={
  doc(path){const r=doc(fs,path);return {
    get:async()=>wrap(await getDoc(r)),
    set:async d=>{try{await setDoc(r,d)}catch(e){throw mapErr(e)}},
    update:d=>updateDoc(r,d),
    delete:()=>deleteDoc(r),
    onSnapshot:(cb,err)=>onSnapshot(r,s=>cb(wrap(s)),e=>err&&err(e)),
    /* trava curta entre aparelhos (resumo do dia, zerar pedidos) */
    acquire:async({holder,ttlMs})=>{const lr=doc(fs,"locks",path.replace(/\//g,"__"));
      try{return await runTransaction(fs,async tx=>{const s=await tx.get(lr),now=Date.now(),d=s.exists()?s.data():null;
        if(d&&d.holder!==holder&&d.exp>now)return {acquired:false};
        tx.set(lr,{holder,exp:now+ttlMs});return {acquired:true}})}catch(e){return {acquired:false}}}
  }},
  collection:name=>qApi(collection(fs,name),[]),
  /* número do pedido: soma 1 no contador do dia, sem repetir entre os caixas */
  newOrder:async(path,day,ord)=>{const c=doc(fs,path),r=doc(collection(fs,"orders"));
    try{return await runTransaction(fs,async tx=>{const s=await tx.get(c),d=s.exists()?s.data():{};const n=(+d.n||0)+1;
      tx.set(c,{...d,n,day});tx.set(r,{...ord,num:n});return n})}catch(e){throw mapErr(e)}},
  /* venda conferida no servidor: na mesma transação lê o estoque do dia e o que já foi vendido
     (campo "vend" no contador do dia), confere (regras.js) e grava o pedido. Se o sabor acabou, recusa a venda.
     criar = pedido novo (numFixo: acréscimo que repete o número da ficha); id + patch = muda um pedido (editar, cancelar, desfazer) */
  venda:async({day,feira,criar,numFixo,id,patch,vendLocal})=>{
    const cRef=doc(fs,"counters",day),sRef=doc(fs,"stock",day),eRef=doc(fs,"config","estoque"),oRef=id?doc(fs,"orders",id):doc(collection(fs,"orders"));
    try{return await runTransaction(fs,async tx=>{
      const [cs,ss,es,os]=await Promise.all([tx.get(cRef),tx.get(sRef),tx.get(eRef),id?tx.get(oRef):Promise.resolve(null)]);
      const c=cs.exists()?cs.data():{};
      if(id&&!os.exists())throw Object.assign(new Error("pedido não existe"),{code:"not-found"});
      const antes=id?os.data():null,depois=id?{...antes,...patch}:criar;
      /* o dia que começou antes desta versão não tem "vend" no contador: parte do que o aparelho vê */
      const vendidos=c.vend&&typeof c.vend==="object"?c.vend:((+c.n||0)>0?vendLocal:{});
      const vend=conferirVenda({antes,depois,vendidos,estoqueDia:ss.exists()?ss.data():null,padroes:es.exists()?es.data():{},feira});
      if(criar){const n=numFixo||(+c.n||0)+1;tx.set(cRef,{...c,n:numFixo?(+c.n||0):n,day,vend});tx.set(oRef,{...criar,num:n});return {n,id:oRef.id}}
      tx.set(cRef,{...c,day,vend});tx.update(oRef,patch);return {id}
    })}catch(e){throw mapErr(e)}},
  counter:async(path,day)=>{const r=doc(fs,path);
    try{return await runTransaction(fs,async tx=>{const s=await tx.get(r),d=s.exists()?s.data():{};const n=(+d.n||0)+1;
      tx.set(r,{...d,n,day});return n})}catch(e){throw mapErr(e)}}
};

const sair=()=>signOut(auth).then(()=>location.reload());
let started=false;
onAuthStateChanged(auth,async user=>{
  if(!user){$("#login").hidden=false;busy(false);msg("Entre com o e-mail e a senha da barraca.");setTimeout(()=>$("#lgEmail").focus(),50);return}
  if(started)return;
  try{
    /* confere se este login está liberado nas regras e cadastra o cardápio na primeira vez */
    const c=await getDoc(doc(fs,"config/barraca"));
    if(!c.exists())await setDoc(doc(fs,"config/barraca"),CARDAPIO_INICIAL);
  }catch(e){
    if(e&&e.code==="permission-denied"){await signOut(auth);$("#login").hidden=false;busy(false);
      msg("Este login entrou, mas não está liberado no banco. Confira o e-mail nas regras do Firestore (veja "Usar com um Firebase de verdade" no README).",true);return}
    /* sem internet: segue com o que estiver salvo no aparelho */
  }
  started=true;$("#login").hidden=true;
  resolve({db,modo:"firebase",sair,descricao:"Este aparelho está conectado como "+user.email+"."});
});
$("#lgEye").addEventListener("click",()=>{const b=$("#lgEye"),i=$("#lgPass"),on=i.type==="password";
  i.type=on?"text":"password";b.setAttribute("aria-pressed",on);b.setAttribute("aria-label",on?"Esconder senha":"Mostrar senha");i.focus()});
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const email=$("#lgEmail").value.trim(),pass=$("#lgPass").value;
  if(!email||!pass){msg("Preencha o e-mail e a senha.",true);return}
  busy(true);msg("Entrando…");
  try{await signInWithEmailAndPassword(auth,email,pass)}
  catch(err){busy(false);const c=err&&err.code||"";
    msg(c==="auth/network-request-failed"?"Sem internet. Conecte o aparelho e tente de novo."
      :c==="auth/too-many-requests"?"Muitas tentativas. Espere alguns minutos e tente de novo."
      :c==="auth/invalid-email"?"Esse e-mail não parece certo. Confira e tente de novo."
      :"E-mail ou senha errados. Confira e tente de novo.",true)}
});
})}
