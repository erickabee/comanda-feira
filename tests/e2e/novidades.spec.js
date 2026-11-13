import { test, expect } from "@playwright/test";
import { abrir, irPara, fazerPedido, senhaGerente } from "./ajuda.js";

test("dois caixas não vendem o mesmo último pastel: o banco recusa a segunda venda", async ({ context }) => {
  const esq = await context.newPage(), dir = await context.newPage();
  await abrir(esq);
  await abrir(dir);
  // o caixa da direita põe 1 camarão no pedido enquanto ainda tem
  await dir.locator('#keysPastel .key[data-f="CAMARÃO"]').click();
  // o caixa da esquerda pega todos os camarões que restam (até o próprio caixa avisar que acabou)
  const key = esq.locator('#keysPastel .key[data-f="CAMARÃO"]');
  for (let i = 0; i < 30 && !(await esq.locator("#toast").isVisible()); i++) await key.click();
  await expect(esq.locator("#toast")).toContainText("Só restam");
  await esq.locator("#consAqui").click();
  await esq.locator("#btnGo").click();
  await expect(esq.locator("#ov")).toBeVisible();
  // a direita tenta finalizar o camarão que já não existe
  await dir.locator("#consViagem").click();
  await dir.locator("#btnGo").click();
  await expect(dir.locator("#toast")).toContainText("CAMARÃO acabou");
  await expect(dir.locator("#ov")).toBeHidden();
  await expect(dir.locator("#cartList")).toContainText("CAMARÃO"); // o pedido continua montado para corrigir
});

test("observação e nome do cliente aparecem para a bandeja e a fritura", async ({ page }) => {
  await abrir(page);
  await page.locator('#keysPastel .key[data-f="CARNE"]').click();
  await page.locator('#keysPastel .key[data-f="QUEIJO"]').click();
  await page.locator('[data-obs="+ vinagrete"]').click();
  await page.locator('[data-obs="+ ketchup"]').click();
  await expect(page.locator("#obsTxt")).toHaveValue("+ vinagrete, + ketchup");
  await page.locator("#pagDepois").click();
  await page.locator("#pagNome").fill("Seu Joaquim");
  await page.locator("#consAqui").click();
  await page.locator("#btnGo").click();
  const n = (await page.locator("#ovNum").textContent()).trim();
  await page.locator("#ovClose").click();
  await expect(page.locator("#obsTxt")).toHaveValue(""); // limpa para o próximo cliente
  await irPara(page, "bandeja");
  const card = page.locator("#listBandeja .ord", { hasText: n });
  await expect(card.locator(".pnome")).toHaveText("Seu Joaquim");
  await expect(card.locator(".obs")).toContainText("+ vinagrete, + ketchup");
  await irPara(page, "fritura");
  await expect(page.locator("#lots .pcard", { hasText: n }).locator(".pnome")).toHaveText("Seu Joaquim");
});

test("pedido da equipe vai para a produção mas não entra no faturamento", async ({ page }) => {
  await abrir(page);
  await page.locator('#keysPastel .key[data-f="PIZZA"]').click();
  await page.locator("#pagEquipe").click();
  await page.locator("#pagNome").fill("Ana");
  await page.locator("#consAqui").click();
  await page.locator("#btnGo").click();
  await expect(page.locator("#ovTot")).toContainText("Equipe · não cobra");
  await page.locator("#ovClose").click();
  await irPara(page, "bandeja");
  await expect(page.locator("#listBandeja .ord", { hasText: "Ana" })).toContainText("Equipe");
});

test("o gerente vê quanto entrou em pastel, caldo e bebida", async ({ page }) => {
  await abrir(page, "gerente");
  await senhaGerente(page);
  const painel = page.locator("#gBody .panel", { hasText: "Faturamento por tipo" });
  await expect(painel).toContainText("Pastéis");
  await expect(painel).toContainText("Caldo de cana");
  await expect(painel).toContainText("Bebidas");
});

test("parte viagem: o caixa marca o que vai para viagem e a bandeja vê numa faixa", async ({ page }) => {
  await abrir(page);
  for (const f of ["CARNE", "CARNE", "QUEIJO"]) await page.locator(`#keysPastel .key[data-f="${f}"]`).click();
  await page.locator('#keysBebida .key[data-f="Coca lata"]').click();
  await page.locator("#consParte").click();
  await expect(page.locator("#btnGo")).toBeDisabled();
  await expect(page.locator("#btnGo")).toHaveText("Marque o que é para viagem");
  await page.locator('[data-vg="pastel"][data-f="CARNE"][data-op="+"]').click();
  await page.locator('[data-vg="bebida"][data-f="Coca lata"][data-op="+"]').click();
  await page.locator("#btnGo").click();
  await expect(page.locator("#ovFichas")).toContainText("Viagem: 1× carne, 1× coca lata");
  const n = (await page.locator("#ovNum").textContent()).trim();
  await page.locator("#ovClose").click();
  await irPara(page, "bandeja");
  const card = page.locator("#listBandeja .ord", { hasText: n });
  await expect(card.locator(".cons.parte")).toHaveText("Parte viagem");
  await expect(card.locator(".viagem-faixa")).toContainText("1× carne, 1× coca lata");
});
