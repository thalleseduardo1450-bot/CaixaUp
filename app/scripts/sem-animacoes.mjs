/**
 * Sem animações de espera: páginas, cartões e janelas entravam com animação
 * (até 0,5 s). As telas já têm regras para o "reduzir movimento" do Windows;
 * este passo, rodado depois do build, faz elas valerem sempre. Indicadores de
 * carregamento continuam animados. O vídeo de abertura não usa estes arquivos.
 *
 * Uso: node scripts/sem-animacoes.mjs dist
 */
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2] || "dist";
const assets = path.join(dist, "assets");
const MARK = "/*caixaup-sem-animacoes*/";
const LOADERS = [".animate-spin", ".animate-pulse", ".loading-bar-line", ".splash-orbit", ".splash-track-fill", ".splash-dots span"];
function reducedMotionAlways(css) {
  const blocks = [];
  const head = "@media (prefers-reduced-motion:reduce){";
  for (let start = css.indexOf(head); start >= 0; start = css.indexOf(head, start + 1)) {
    let depth = 0;
    let end = start + head.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(start + head.length, end));
  }
  return blocks;
}
let cssBlocks = 0;
for (const name of fs.readdirSync(assets).filter((file) => file.endsWith(".css"))) {
  const file = path.join(assets, name);
  const css = fs.readFileSync(file, "utf8");
  if (css.includes(MARK)) continue;
  const blocks = reducedMotionAlways(css);
  if (!blocks.length) continue;
  const loaders = LOADERS.flatMap((selector) => {
    const rule = css.match(new RegExp(`(?:^|})${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*?animation:([^;}]+)`));
    return rule && !/^none/.test(rule[1]) ? [`${selector}{animation:${rule[1]}!important}`] : [];
  });
  fs.writeFileSync(file, `${css}\n${MARK}${blocks.join("")}${loaders.join("")}`);
  cssBlocks += blocks.length;
  console.log(`+ ${name}: ${blocks.length} regras sem animação, ${loaders.length} indicadores mantidos`);
}
if (!cssBlocks) throw new Error("Nenhuma regra de reduzir movimento encontrada no CSS.");

console.log("Animações de espera desligadas.");
