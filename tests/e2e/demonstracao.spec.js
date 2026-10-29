import { test, expect } from "@playwright/test";
import { abrir, irPara, senhaGerente, fazerPedido } from "./ajuda.js";

test("roteiro de 1 minuto se marca sozinho conforme a pessoa usa", async ({ page }) => {
  await abrir(page);
  await expect(page.locator("#rtCont")).toHaveText("0 de 4");
  const n = await fazerPedido(page, { pasteis: ["QUEIJO"] });
  await expect(page.locator('#roteiro li[data-rt="1"]')).toHaveClass(/ok/);
  await page.locator('#roteiro [data-ir="fritura"]').click(); // o passo leva para a aba certa
  await expect(page.locator("#v-fritura")).toBeVisible();
  await expect(page.locator('#roteiro li[data-rt="2"]')).toHaveClass(/ok/);
  await irPara(page, "bandeja");
  await page.locator("#listBandeja .ord", { hasText: n }).last().locator('.ub-main[data-key="p|QUEIJO"]').click();
  await expect(page.locator('#roteiro li[data-rt="3"]')).toHaveClass(/ok/);
  await irPara(page, "gerente");
  await senhaGerente(page);
  await expect(page.locator("#rtCont")).toHaveText("pronto, você viu tudo!");
});

test("fritura aberta em outra aba marca o passo 2 quando o pedido chega", async ({ context }) => {
  const caixa = await context.newPage(), fritura = await context.newPage();
  await abrir(caixa);
  await abrir(fritura, "fritura");
  await fazerPedido(caixa, { pasteis: ["CARNE"] });
  await expect(caixa.locator('#roteiro li[data-rt="2"]')).toHaveClass(/ok/);
});

test("começar com a feira vazia zera os pedidos de hoje e mantém o histórico", async ({ page }) => {
  await abrir(page, "fritura");
  await expect(page.locator("#lots .pcard")).not.toHaveCount(0);
  await page.locator("#demoVazia").click();
  await expect(page.locator("#statusTxt")).toHaveText("Conectado");
  await irPara(page, "fritura");
  await expect(page.locator("#lots .idle")).toContainText("Nenhum pastel para fritar");
  await irPara(page, "caixa");
  expect(await fazerPedido(page, { pasteis: ["PIZZA"] })).toBe("001");
  await irPara(page, "gerente");
  await senhaGerente(page);
  await page.locator('#gPer [data-p="mes"]').click();
  await expect(page.locator("#gChart .col")).not.toHaveCount(0);
});

test("restaurar exemplo volta com a feira de exemplo", async ({ page }) => {
  await abrir(page);
  await page.locator("#demoVazia").click();
  await expect(page.locator("#statusTxt")).toHaveText("Conectado");
  await page.locator("#demoReset").click();
  await expect(page.locator("#statusTxt")).toHaveText("Conectado");
  await expect(page.locator("#aCobrar")).toContainText("Moço do boné azul");
});
