import { test, expect } from "@playwright/test";
import { abrir, fazerPedido } from "./ajuda.js";

test("cobrar depois, acrescentar com o mesmo número e receber tudo com troco", async ({ page }) => {
  await abrir(page);
  const n = await fazerPedido(page, { pasteis: ["CARNE"], cobrarDepois: "João" });
  const conta = page.locator("#aCobrar .cb-row", { hasText: "João" });
  await expect(conta).toContainText("R$ 11,00");

  await conta.locator("[data-acrescentar]").click();
  await expect(page.locator("#addBar")).toContainText("Acrescentando na conta João");
  const n2 = await fazerPedido(page, { bebidas: ["Coca lata"] });
  expect(n2).toBe(n); // acréscimo repete o número da ficha que o cliente já tem
  await expect(conta).toContainText("R$ 18,00");

  await conta.locator("[data-cobrar]").click();
  await page.locator("#cbRec").fill("5000");
  await expect(page.locator("#cbTroco")).toContainText("R$ 32,00");
  await page.locator("#cbDin").click();
  await expect(page.locator("#aCobrar .cb-row", { hasText: "João" })).toHaveCount(0);
});
