/* Dados de exemplo do modo demonstração: o cardápio real da C&G Pastéis, uma feira "acontecendo hoje"
   (pedidos em vários estados, ou nenhum, com "feira vazia") e dez semanas de feiras anteriores para os gráficos do Gerente.
   Os números de vendas são inventados. */
import { CARDAPIO_INICIAL as C } from "./cardapio-inicial.js";

export const PIN_DEMO = "1234";
export const hoje = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

const preco = (lista, nome) => { const it = lista.find(x => x.n === nome.split(" + ")[0]); return it ? it.p : 0 };
const totalDe = o => Math.round((
  Object.entries(o.pastel || {}).reduce((a, [f, q]) => a + q * preco(C.pastel, f), 0) +
  Object.entries(o.caldo || {}).reduce((a, [f, q]) => a + q * preco(C.caldo, f), 0) +
  Object.entries(o.bebida || {}).reduce((a, [f, q]) => a + q * preco(C.bebida, f), 0)) * 100) / 100;

/* sorteio com semente, para o histórico ficar igual a cada vez que a demonstração é restaurada no mesmo dia */
function sorteio(semente) { let a = semente >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

async function hashPin(salt, pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("comanda-feira:" + salt + ":" + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const PADRAO = {
  terca:   { CARNE: 60, QUEIJO: 60, PIZZA: 30, FRANGO: 36, PALMITO: 18, "CARNE/QUEIJO": 48, "CARNE/OVO": 18, CALABRESA: 12, "CARNE/SECA": 12, BROCOLIS: 8, BACON: 0, PORTUGUESA: 8, "CAMARÃO": 6, "FRANGO/QUEIJO": 10, "3 QUEIJOS": 8, ESPECIAL: 6 },
  sexta:   { CARNE: 76, QUEIJO: 60, PIZZA: 90, FRANGO: 54, PALMITO: 30, "CARNE/QUEIJO": 72, "CARNE/OVO": 30, CALABRESA: 30, "CARNE/SECA": 30, BROCOLIS: 16, BACON: 0, PORTUGUESA: 12, "CAMARÃO": 6, "FRANGO/QUEIJO": 14, "3 QUEIJOS": 10, ESPECIAL: 30 },
  domingo: { CARNE: 90, QUEIJO: 80, PIZZA: 90, FRANGO: 60, PALMITO: 30, "CARNE/QUEIJO": 80, "CARNE/OVO": 36, CALABRESA: 36, "CARNE/SECA": 36, BROCOLIS: 20, BACON: 12, PORTUGUESA: 18, "CAMARÃO": 12, "FRANGO/QUEIJO": 18, "3 QUEIJOS": 14, ESPECIAL: 30 }
};
const FEIRA_DO_DIA = { 2: "terca", 5: "sexta", 0: "domingo" };

export async function gerarDemo({ vazia = false } = {}) {
  const agora = Date.now(), dia = hoje(), D = {};
  D["config/barraca"] = JSON.parse(JSON.stringify(C));
  const salt = "demo" + Math.random().toString(36).slice(2, 8);
  D["config/pin"] = { salt, hash: await hashPin(salt, PIN_DEMO) };
  D["config/estoque"] = PADRAO;
  D["stock/" + dia] = { day: dia, feira: FEIRA_DO_DIA[new Date().getDay()] || "sexta" };

  /* a feira de hoje: do mais antigo (já entregue) ao mais novo (acabou de chegar) */
  const min = m => agora - m * 60000;
  const P = [
    { num: 1, t: min(48), caixa: "Esquerda", consumo: "aqui", pastel: { CARNE: 2 }, bebida: { "Coca lata": 1 }, entregue: true, pagamento: { tipo: "dinheiro", recebido: 50, troco: 21 } },
    { num: 2, t: min(44), caixa: "Direita", consumo: "viagem", pastel: { QUEIJO: 1, PIZZA: 1 }, caldo: { "300 ml (copo) + Limão": 1 }, entregue: true },
    { num: 3, t: min(39), caixa: "Esquerda", consumo: "aqui", pastel: { "CARNE/QUEIJO": 2 }, bebida: { "Guaraná": 1 }, entregue: true, pagamento: { tipo: "dinheiro", recebido: 40, troco: 8 } },
    { num: 4, t: min(31), caixa: "Direita", consumo: "aqui", pastel: { "FRANGO/QUEIJO": 1 }, caldo: { "500 ml (copo)": 1 }, pastelDone: true },
    { num: 5, t: min(27), caixa: "Esquerda", consumo: "viagem", pastel: { ESPECIAL: 1 }, bebida: { "Água": 1 }, cancelado: true },
    { num: 6, t: min(22), caixa: "Direita", consumo: "viagem", pastel: { CARNE: 3, CALABRESA: 2, PORTUGUESA: 2, "CAMARÃO": 2, PIZZA: 3, "3 QUEIJOS": 1 }, oleo: true, ent: { "p|CARNE": 2, "p|PIZZA": 1 } },
    { num: 7, t: min(18), caixa: "Esquerda", consumo: "aqui", pastel: { QUEIJO: 2 }, bebida: { "Coca Zero lata": 1 }, pago: false, cobrarNome: "Moço do boné azul", id: "demo-07" },
    { num: 7, t: min(9), caixa: "Esquerda", consumo: "aqui", pastel: { CARNE: 1 }, caldo: { "300 ml (copo) + Maracujá": 1 }, pago: false, cobrarNome: "Moço do boné azul", conta: "demo-07", acrescimo: true },
    { num: 8, t: min(12), caixa: "Direita", consumo: "viagem", caldo: { "1 Litro (garrafa) + Abacaxi": 1, "¹/2 Litro (garrafa)": 1 } },
    { num: 9, t: min(6), caixa: "Direita", consumo: "viagem", pastel: { PALMITO: 1, "CARNE/OVO": 1, FRANGO: 2 } },
    { num: 10, t: min(2), caixa: "Esquerda", consumo: "aqui", pastel: { CARNE: 1, QUEIJO: 1 }, bebida: { Sprite: 1 } }
  ];
  if (!vazia) P.forEach((p, i) => {
    const o = { num: p.num, day: dia, t: p.t, caixa: p.caixa, consumo: p.consumo, pastel: p.pastel || {}, caldo: p.caldo || {}, bebida: p.bebida || {} };
    o.total = totalDe(o);
    const temP = Object.keys(o.pastel).length + Object.keys(o.bebida).length > 0, temC = Object.keys(o.caldo).length > 0;
    o.pastelDone = p.entregue || p.pastelDone || !temP; o.caldoDone = p.entregue || !temC;
    if (o.pastelDone && temP) o.pastelAt = p.t + 7 * 60000;
    for (const k of ["pagamento", "pago", "cobrarNome", "conta", "acrescimo", "oleo", "ent", "cancelado"]) if (p[k] !== undefined) o[k] = p[k];
    if (p.oleo) o.oleoAt = agora - 3 * 60000;
    if (p.cancelado) o.canceladoAt = p.t + 60000;
    D["orders/" + (p.id || "demo-" + String(i + 1).padStart(2, "0") + (p.acrescimo ? "b" : ""))] = o;
  });
  D["counters/" + dia] = { day: dia, n: vazia ? 0 : 10 };

  /* dez semanas de feiras anteriores (terça, sexta e domingo), já fechadas como resumo do dia */
  const pesoP = { CARNE: 16, QUEIJO: 13, PIZZA: 11, FRANGO: 8, PALMITO: 4, "CARNE/QUEIJO": 12, "CARNE/OVO": 5, CALABRESA: 5, "CARNE/SECA": 5, BROCOLIS: 2, BACON: 1, PORTUGUESA: 3, "CAMARÃO": 2, "FRANGO/QUEIJO": 3, "3 QUEIJOS": 3, ESPECIAL: 4 };
  const pesoC = { "300 ml (copo)": 6, "400 ml (copo)": 4, "500 ml (copo)": 4, "¹/2 Litro (garrafa)": 5, "1 Litro (garrafa)": 2, "300 ml (copo) + Limão": 2, "500 ml (copo) + Limão": 2, "400 ml (copo) + Maracujá": 1 };
  const pesoB = { "Coca lata": 8, "Coca Zero lata": 4, "Guaraná": 5, "Fanta Laranja": 2, Sprite: 2, "Água": 4, "Coca 600": 2, "Suco Maracujá": 1 };
  const reparte = (r, total, pesos) => { const out = {}, soma = Object.values(pesos).reduce((a, b) => a + b, 0);
    Object.entries(pesos).forEach(([k, w]) => { const q = Math.max(0, Math.round(total * w / soma * (0.75 + r() * 0.5))); if (q) out[k] = q }); return out };
  const base = { 2: 140, 5: 220, 0: 260 };
  for (let k = 1; k <= 70; k++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - k);
    if (!(d.getDay() in base)) continue;
    const r = sorteio(+hoje(d).replace(/-/g, "")), pedidos = Math.round(base[d.getDay()] * (0.82 + r() * 0.36));
    const s = { day: hoje(d), orders: pedidos, pastel: reparte(r, pedidos * 1.9, pesoP), caldo: reparte(r, pedidos * 0.45, pesoC), bebida: reparte(r, pedidos * 0.55, pesoB), ids: [] };
    s.total = totalDe(s);
    s.dinheiro = Math.round(s.total * (0.3 + r() * 0.12) * 100) / 100; s.troco = Math.round(s.dinheiro * (0.18 + r() * 0.1) * 100) / 100;
    const esq = Math.round(pedidos * (0.45 + r() * 0.1)), fe = esq / pedidos;
    s.porCaixa = { Esquerda: { orders: esq, total: Math.round(s.total * fe * 100) / 100, dinheiro: Math.round(s.dinheiro * fe * 100) / 100 },
      Direita: { orders: pedidos - esq, total: Math.round(s.total * (1 - fe) * 100) / 100, dinheiro: Math.round(s.dinheiro * (1 - fe) * 100) / 100 } };
    const aqui = Math.round(pedidos * (0.55 + r() * 0.15)); s.consumo = { aqui, viagem: pedidos - aqui };
    s.cancelados = Math.floor(r() * 4); s.canceladosValor = Math.round(s.cancelados * 13.5 * 100) / 100;
    D["daily/" + s.day] = s;
  }
  return D;
}
