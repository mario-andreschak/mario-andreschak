// Draws every card in assets/tiles/ and writes README.md from tools/projects.json.
// Usage, from tools/: npm ci && node build.mjs
// To add a project: put a screenshot in assets/shots/ (or draw one in tiles.html),
// add it to projects.json, and run this again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const tools = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(tools);
const data = JSON.parse(fs.readFileSync(path.join(tools, 'projects.json'), 'utf8'));
const out = path.join(root, 'assets', 'tiles');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
await page.goto(pathToFileURL(path.join(tools, 'tiles.html')).href);
await page.waitForFunction(() => window.ready);

const themes = ['light', 'dark'];
async function draw(stem, spec) {
  for (const theme of themes) {
    await page.evaluate(s => window.render(s), { ...spec, theme });
    const png = await page.locator('#stage > *').screenshot({ omitBackground: true });
    const webp = await page.evaluate(b => window.toWebp(b), png.toString('base64'));
    fs.writeFileSync(path.join(out, `${stem}-${theme}.webp`), Buffer.from(webp, 'base64'));
  }
  console.log('drew', stem);
}

const P = data.projects;
await draw('header', { kind: 'header', h: data.header });
let n = 0;
for (const s of data.sections) {
  n++;
  await draw(`s-${s.id}`, { kind: 'section', num: String(n).padStart(2, '0'), title: s.title, line: s.line });
  for (const [hero, a, b] of s.blocks || []) {
    await draw(hero, { kind: 'tall', p: P[hero] });
    await draw(a, { kind: 'small', p: P[a] });
    await draw(b, { kind: 'small', p: P[b] });
  }
  for (const id of s.row || []) await draw(id, { kind: 'third', p: P[id] });
  if (s.wide) await draw(s.wide, { kind: 'wide', p: P[s.wide] });
}
await browser.close();

const quote = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const themed = (stem, alt) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/tiles/${stem}-dark.webp">` +
  `<img src="assets/tiles/${stem}-light.webp" alt="${quote(alt)}" width="100%"></picture>`;
const tile = id => `<a href="${P[id].url}">${themed(id, `${P[id].name}: ${P[id].line}`)}</a>`;

function bento(blocks) {
  const rows = [];
  blocks.forEach(([hero, a, b], i) => {
    const big = `<td width="50%" rowspan="2" valign="top">${tile(hero)}</td>`;
    const first = `<td width="50%" valign="top">${tile(a)}</td>`;
    rows.push(`<tr>${i % 2 === 0 ? big + first : first + big}</tr>`);
    rows.push(`<tr><td valign="top">${tile(b)}</td></tr>`);
  });
  return `<table>\n${rows.join('\n')}\n</table>`;
}
const stars = id => `<img src="https://img.shields.io/github/stars/${data.owner}/${P[id].repo}?style=flat-square&label=stars&color=6d5ef0" alt="GitHub stars">`;
const row = (ids, withStars) => `<table>\n<tr>${ids.map(id => `<td width="33%" valign="top">${tile(id)}</td>`).join('')}</tr>${withStars ? `\n<tr>${ids.map(id => `<td align="center">${stars(id)}</td>`).join('')}</tr>` : ''}\n</table>`;

const parts = [
  themed('header', data.header.alt),
  '',
  `<p align="center">${data.links.map(([t, u]) => `<a href="${u}">${t}</a>`).join(' &nbsp;·&nbsp; ')}</p>`,
  `<p align="center"><a href="https://github.com/mario-andreschak/FLUJO"><img src="https://img.shields.io/github/stars/mario-andreschak/FLUJO?style=for-the-badge&label=FLUJO%20stars&color=6d5ef0" alt="FLUJO stars"></a></p>`,
];
for (const s of data.sections) {
  parts.push('', '<br>', '', themed(`s-${s.id}`, `${s.title}. ${s.line}`), '');
  if (s.blocks) parts.push(bento(s.blocks), '');
  if (s.row) parts.push(row(s.row, s.stars), '');
  if (s.wide) parts.push(`<a href="${P[s.wide].url}">${themed(s.wide, `${P[s.wide].name}: ${P[s.wide].line}`)}</a>`, '');
}
parts.push('<br>', '', `<sub>Also: ${data.also.map(([t, u, d]) => `<a href="${u}">${t}</a>, ${d}`).join(' · ')}.</sub>`, '');
fs.writeFileSync(path.join(root, 'README.md'), parts.join('\n'));
console.log('wrote README.md');
