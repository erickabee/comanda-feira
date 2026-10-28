// Servidor estático mínimo para rodar o site e os testes de tela localmente: node tests/servidor.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const porta = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const arquivo = join(raiz, caminho.endsWith("/") ? caminho + "index.html" : caminho);
  try { const dados = await readFile(arquivo); res.writeHead(200, { "Content-Type": tipos[extname(arquivo)] || "application/octet-stream" }); res.end(dados) }
  catch { res.writeHead(404); res.end("Não encontrado") }
}).listen(porta, () => console.log(`Comanda da Feira em http://localhost:${porta}`));
