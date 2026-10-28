// Funções usadas pelos testes de tela. Cada teste abre um navegador limpo, então começa com o exemplo novo.
import { expect } from "@playwright/test";

export async function abrir(page, aba = "caixa") {
  await page.goto("/");
  await expect(page.locator("#statusTxt")).toHaveText("Conectado");
  await irPara(page, aba);
}
export async function irPara(page, aba) {
  await page.locator(`#tabs button[data-v="${aba}"]`).click();
}
export async function senhaGerente(page, pin = "1234") {
  for (const d of pin) await page.locator(`#lkPad [data-d="${d}"]`).click();
  await page.locator('#lkPad [data-d="ok"]').click();
}
/* monta e finaliza um pedido no caixa; devolve o número que o sistema deu */
export async function fazerPedido(page, { pasteis = [], bebidas = [], consumo = "aqui", cobrarDepois = null } = {}) {
  for (const p of pasteis) await page.locator(`#keysPastel .key[data-f="${p}"]`).click();
  for (const b of bebidas) await page.locator(`#keysBebida .key[data-f="${b}"]`).click();
  if (cobrarDepois !== null) { await page.locator("#pagDepois").click(); await page.locator("#pagNome").fill(cobrarDepois) }
  await page.locator(consumo === "viagem" ? "#consViagem" : "#consAqui").click();
  await page.locator("#btnGo").click();
  const ficha = page.locator("#ov");
  await expect(ficha).toBeVisible();
  const numero = (await page.locator("#ovNum").textContent()).trim();
  await page.locator("#ovClose").click();
  return numero;
}
