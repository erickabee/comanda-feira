import { test, expect } from "@playwright/test";
import { abrir, irPara, senhaGerente } from "./ajuda.js";

/* nenhuma tela pode rolar para o lado nem ter texto saindo do botão ou do quadro */
async function semNadaVazando(page) {
  const problemas = await page.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    if (document.documentElement.scrollWidth > W) out.push("a página rola para o lado");
    for (const el of document.querySelectorAll(".fl,.ubg,.key,.cd,.cb-row,.ord,.pcard,.srow,.kpi,.go,.ghost,#tabs button")) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 1) out.push("passa da tela: " + el.textContent.trim().slice(0, 30));
      for (const c of el.querySelectorAll("*")) {
        if (c.offsetParent === null) continue;
        const q = c.getBoundingClientRect();
        if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) { out.push("vaza do quadro: " + el.textContent.trim().slice(0, 30)); break }
      }
    }
    return out;
  });
  expect(problemas).toEqual([]);
}

for (const aba of ["caixa", "fritura", "bandeja", "caldo"]) {
  test(`tela ${aba}: nada passa da tela`, async ({ page }) => {
    await abrir(page, aba);
    await semNadaVazando(page);
  });
}

test("telas do gerente (estoque, relatório e ajustes): nada passa da tela", async ({ page }) => {
  await abrir(page, "gerente");
  await senhaGerente(page);
  await expect(page.locator("#gBody .kpis")).toContainText("Faturamento");
  await semNadaVazando(page);
  for (const aba of ["estoque", "ajustes"]) { await irPara(page, aba); await semNadaVazando(page) }
});

test("relatório do mês usa o histórico das feiras anteriores", async ({ page }) => {
  await abrir(page, "gerente");
  await senhaGerente(page);
  await page.locator('#gPer [data-p="mes"]').click();
  await expect(page.locator("#gBody .kpis")).toContainText("vs mês anterior");
  await expect(page.locator("#gChart .col")).not.toHaveCount(0);
});
