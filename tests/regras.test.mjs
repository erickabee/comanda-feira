// Testes das regras de negócio (node --test). Não precisam de navegador nem de banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brl, comoDevolver, dividirConta, fila, entSet, emptySum, addOrder, cashOf, trocoOf } from "../js/regras.js";

test("brl formata em reais, com milhar e centavos", () => {
  assert.equal(brl(11.5), "R$ 11,50");
  assert.equal(brl(76792.5), "R$ 76.792,50");
  assert.equal(brl(0.1 + 0.2), "R$ 0,30");
});

test("troco é devolvido com o menor número de notas e moedas", () => {
  assert.deepEqual(comoDevolver(3200), ["1× R$ 20", "1× R$ 10", "1× R$ 2"]);
  assert.deepEqual(comoDevolver(2150), ["1× R$ 20", "1× R$ 1", "1× R$ 0,50"]);
  assert.deepEqual(comoDevolver(0), []);
});

test("conta em partes iguais não perde nem cria centavos", () => {
  const { parts } = dividirConta({ total: 10000, pessoas: 3, modo: "igual" });
  assert.deepEqual(parts, [3334, 3333, 3333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
});

test("conta por item divide o item compartilhado e avisa o que ficou sem dono", () => {
  const unidades = [{ id: "caldo", c: 2400 }, { id: "carne", c: 1100 }, { id: "queijo", c: 1100 }];
  const { parts, sem } = dividirConta({ total: 4600, pessoas: 2, modo: "item", unidades, donos: { caldo: [0, 1], carne: [0] } });
  assert.deepEqual(parts, [1200 + 1100, 1200]);
  assert.equal(sem, 1100);
});

test("fila segue o número do pedido, não o relógio do celular", () => {
  const pedidos = [
    { num: 2, t: 1_000 },                    // caixa com relógio atrasado
    { num: 1, t: 300_000 },
    { num: 1, t: 200_000, acrescimo: true }, // acréscimo vem depois do pedido original
    { num: 3, t: 50_000 }
  ];
  assert.deepEqual(pedidos.sort(fila).map(p => p.num + (p.acrescimo ? "+" : "")), ["1", "1+", "2", "3"]);
});

test("marcações de entrega aceitam o formato novo (posições) e o antigo (quantidade)", () => {
  assert.deepEqual([...entSet([2, 0, 9], 3)].sort(), [0, 2]);
  assert.deepEqual([...entSet(2, 3)], [0, 1]);
  assert.equal(entSet(undefined, 3).size, 0);
});

test("resumo do dia: cancelado fica fora, acréscimo não conta como pedido novo, a cobrar fica em aberto", () => {
  const s = emptySum("2026-10-23");
  addOrder(s, { caixa: "Esquerda", consumo: "aqui", pastel: { CARNE: 2 }, total: 22, pagamento: { tipo: "dinheiro", recebido: 50, troco: 28 } });
  addOrder(s, { caixa: "Direita", consumo: "viagem", pastel: { QUEIJO: 1 }, total: 11, pago: false });
  addOrder(s, { caixa: "Direita", consumo: "viagem", pastel: { PIZZA: 1 }, total: 11.5, pago: false, acrescimo: true });
  addOrder(s, { caixa: "Esquerda", pastel: { ESPECIAL: 1 }, total: 23, cancelado: true });
  assert.equal(s.orders, 2);
  assert.equal(s.total, 44.5);
  assert.equal(s.dinheiro, 22);
  assert.equal(s.troco, 28);
  assert.equal(s.aReceber, 22.5);
  assert.equal(s.cancelados, 1);
  assert.equal(s.canceladosValor, 23);
  assert.deepEqual(s.consumo, { aqui: 1, viagem: 1 });
  assert.deepEqual(s.pastel, { CARNE: 2, QUEIJO: 1, PIZZA: 1 });
  assert.equal(s.porCaixa.Direita.orders, 1);
});

test("dinheiro e troco de conta dividida somam só quem pagou em dinheiro", () => {
  const o = { total: 30, pagamento: { tipo: "dividido", partes: [{ valor: 15, recebido: 20, troco: 5 }, { valor: 15 }] } };
  assert.equal(cashOf(o), 15);
  assert.equal(trocoOf(o), 5);
});
