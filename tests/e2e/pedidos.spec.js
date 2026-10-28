import { test, expect } from "@playwright/test";
import { abrir, irPara, fazerPedido } from "./ajuda.js";

test("o caixa só finaliza depois de escolher comer aqui ou viagem", async ({ page }) => {
  await abrir(page);
  await page.locator('#keysPastel .key[data-f="CARNE"]').click();
  await expect(page.locator("#btnGo")).toBeDisabled();
  await expect(page.locator("#btnGo")).toHaveText("Escolha: aqui ou viagem");
  await page.locator("#consViagem").click();
  await expect(page.locator("#btnGo")).toBeEnabled();
});

test("pedido novo ganha o próximo número e aparece na fritura e na bandeja", async ({ page }) => {
  await abrir(page);
  const n = await fazerPedido(page, { pasteis: ["CALABRESA", "CALABRESA"], bebidas: ["Guaraná"], consumo: "viagem" });
  expect(n).toBe("011"); // o exemplo já tem 10 pedidos hoje
  await irPara(page, "fritura");
  await expect(page.locator("#lots .pcard", { hasText: "011" })).toContainText("CALABRESA");
  await irPara(page, "bandeja");
  await expect(page.locator("#listBandeja .ord", { hasText: "011" })).toContainText("Guaraná");
});

test("pedido feito numa aba chega na outra, como entre o caixa e a fritura", async ({ context }) => {
  const caixa = await context.newPage(), fritura = await context.newPage();
  await abrir(caixa);
  await abrir(fritura, "fritura");
  const n = await fazerPedido(caixa, { pasteis: ["PIZZA"] });
  await expect(fritura.locator("#lots .pcard", { hasText: n })).toBeVisible();
  await expect(fritura.locator("#novoPedido")).toHaveText(`PEDIDO NOVO · ${n}`);
});

test("quem frita marca 'Coloquei no óleo' e pode desfazer", async ({ page }) => {
  await abrir(page, "fritura");
  const primeiro = page.locator("#lots .pcard").first();
  const numero = (await primeiro.locator(".pc-num").textContent()).trim().slice(0, 3);
  await primeiro.locator("[data-oleo]").click();
  await expect(page.locator("#lots .oilbox")).toContainText(numero);
  await page.locator("#lots .undo [data-desoleo]").click();
  await expect(page.locator("#lots .pcard").first()).toContainText(numero);
});

test("bandeja conta cada sabor entregue e fecha o pedido quando tudo foi entregue", async ({ page }) => {
  await abrir(page);
  const n = await fazerPedido(page, { pasteis: ["CARNE", "CARNE", "QUEIJO"] });
  await irPara(page, "bandeja");
  const pedido = page.locator("#listBandeja .ord", { hasText: n }).last();
  const carne = pedido.locator('.ub-main[data-key="p|CARNE"]');
  await carne.click();
  await expect(carne).toContainText("1/2");
  await expect(pedido.locator(".falta")).toContainText("1× CARNE, 1× QUEIJO");
  await carne.click();
  await pedido.locator('.ub-main[data-key="p|QUEIJO"]').click();
  await expect(page.locator("#undoBandeja")).toContainText(`Pedido ${n} marcado como entregue`);
});

test("cancelar pedido tira das telas e avisa quanto devolver", async ({ page }) => {
  await abrir(page);
  const n = await fazerPedido(page, { pasteis: ["ESPECIAL"] });
  await page.locator("#btnCancelar").click();
  await page.locator("#cnBusca").fill(String(+n));
  await page.locator("[data-cnask]").click();
  await expect(page.locator(".cn-row.ask")).toContainText("devolva R$ 23,00");
  await page.locator("[data-cnyes]").click();
  await expect(page.locator("#cnUndo")).toContainText(`Pedido ${n} cancelado`);
  await page.locator("#cnClose").click();
  await irPara(page, "fritura");
  await expect(page.locator("#lots .pcard", { hasText: n })).toHaveCount(0);
});
