/* Regras de negócio da Comanda da Feira: funções puras, sem tela e sem banco.
   Testadas em tests/regras.test.mjs (node --test). Dinheiro é tratado em centavos sempre que há divisão,
   para não sobrar nem faltar R$ 0,01. */

export const brl=v=>"R$ "+(Math.round((+v||0)*100)/100).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
export const pad=n=>String(n).padStart(3,"0");
export const sum=o=>Object.values(o||{}).reduce((a,b)=>a+(+b||0),0);
export const r2=v=>Math.round((+v||0)*100)/100;
export const CEDULAS=[20000,10000,5000,2000,1000,500,200,100,50,25,10,5];
export function comoDevolver(cents){
  const out=[];for(const v of CEDULAS){const q=Math.floor(cents/v);if(q){out.push(q+"× R$ "+(v>=100?String(v/100):(v/100).toFixed(2).replace(".",",")));cents-=q*v}}
  return out;
}
export const fila=(a,b)=>((+a.num||0)-(+b.num||0))||((a.acrescimo?1:0)-(b.acrescimo?1:0))||((a.t||0)-(b.t||0));
export function entSet(v,q){const st=new Set();if(Array.isArray(v))v.forEach(i=>{i=+i;if(i>=0&&i<q)st.add(i)});else for(let i=0;i<Math.min(q,+v||0);i++)st.add(i);return st}
export const addTo=(acc,obj)=>{Object.entries(obj||{}).forEach(([k,q])=>{if(+q>0)acc[k]=(acc[k]||0)+(+q)})};
export function emptySum(day){return {day,orders:0,total:0,pastel:{},caldo:{},bebida:{},dinheiro:0,troco:0,porCaixa:{}}}
export function cashOf(o){const p=o.pagamento;if(!p)return 0;if(p.tipo==="dinheiro")return +o.total||0;
  if(p.tipo==="dividido"&&Array.isArray(p.partes))return p.partes.reduce((a,x)=>a+(x.recebido?(+x.valor||0):0),0);return 0}
export function trocoOf(o){const p=o.pagamento;if(!p)return 0;if(p.tipo==="dinheiro")return +p.troco||0;
  if(p.tipo==="dividido"&&Array.isArray(p.partes))return p.partes.reduce((a,x)=>a+(+x.troco||0),0);return 0}
export function addOrder(s,o){if(o.cancelado){s.cancelados=(+s.cancelados||0)+1;s.canceladosValor=r2((+s.canceladosValor||0)+(+o.total||0));return}if(!o.acrescimo)s.orders++;s.total=Math.round((s.total+(+o.total||0))*100)/100;addTo(s.pastel,o.pastel);addTo(s.caldo,o.caldo);addTo(s.bebida,o.bebida);
  const cash=cashOf(o);s.dinheiro=r2((+s.dinheiro||0)+cash);s.troco=r2((+s.troco||0)+trocoOf(o));
  s.porCaixa=s.porCaixa||{};const n=o.caixa||"sem nome",c=s.porCaixa[n]=s.porCaixa[n]||{orders:0,total:0,dinheiro:0};
  if(!o.acrescimo)c.orders++;c.total=r2(c.total+(+o.total||0));c.dinheiro=r2(c.dinheiro+cash);
  if((o.consumo==="aqui"||o.consumo==="viagem")&&!o.acrescimo){s.consumo={...(s.consumo||{})};s.consumo[o.consumo]=(s.consumo[o.consumo]||0)+1}
  if(o.pago===false)s.aReceber=r2((+s.aReceber||0)+(+o.total||0))}

/* Divide a conta em centavos. "igual": partes iguais, os centavos que sobram vão para as primeiras pessoas.
   "item": cada unidade (pastel, copo, bebida) é dividida entre as pessoas marcadas nela;
   o que ninguém marcou volta em "sem" (falta escolher de quem é). */
export function dividirConta({total,pessoas,modo,unidades=[],donos={}}){
  const n=pessoas,parts=Array(n).fill(0);let sem=0;
  if(modo==="igual"){const base=Math.floor(total/n),rem=total-base*n;for(let i=0;i<n;i++)parts[i]=base+(i<rem?1:0)}
  else unidades.forEach(u=>{const arr=(donos[u.id]||[]).filter(p=>p<n).sort((a,b)=>a-b);
    if(!arr.length){sem+=u.c;return}
    const base=Math.floor(u.c/arr.length),rem=u.c-base*arr.length;arr.forEach((p,j)=>{parts[p]+=base+(j<rem?1:0)})});
  return {parts,sem};
}
