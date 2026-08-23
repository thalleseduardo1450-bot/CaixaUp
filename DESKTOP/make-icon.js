/**
 * Gera build/icon.png (256x256) com a nova identidade do CaixaUp:
 * caixa registradora + gráfico ascendente + seta.
 * PNG escrito na mao com zlib, sem dependencias externas.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 256;
const RADIUS = 56;
const SS = 4; // supersampling por eixo

const FROM = [37, 99, 235]; // #2563EB
const TO = [29, 78, 216]; // #1D4ED8

// Cores da nova marca
const BARS_COLOR = [96, 165, 250]; // #60A5FA
const BODY_COLOR = [27, 41, 63]; // #1B293F (corpo escuro do caixa)
const SCREEN_COLOR = [125, 211, 252]; // #7DD3FC
const SCREEN_MARK = [29, 78, 216]; // #1D4ED8
const DRAWER_COLOR = [37, 99, 235]; // #2563EB
const PAPER_COLOR = [248, 250, 252]; // #F8FAFC
const PAPER_DOT = [148, 163, 184]; // #94A3B8
const KEYPAD_COLOR = [125, 211, 252]; // #7DD3FC
const KEYHOLE_COLOR = [226, 232, 240]; // #E2E8F0

const inRounded = (x, y) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
};

const inCircle = (x, y, cx, cy, r) => {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

const inSeg = (x, y, x0, y0, x1, y1, w) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((x - x0) * dx + (y - y0) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + t * dx;
  const py = y0 + t * dy;
  const ddx = x - px;
  const ddy = y - py;
  return ddx * ddx + ddy * ddy <= (w / 2) * (w / 2);
};

// Barras ascendentes: [x0, y0 (topo), x1, y1 (base)]
const BARS = [
  [150, 92, 166, 122],
  [172, 76, 188, 122],
  [194, 60, 210, 122],
  [216, 44, 232, 122],
];

// Código de barras na tela: [x, largura]
const BARCODE = [
  [66, 3],
  [74, 2],
  [84, 5],
  [94, 2],
  [104, 3],
];

// Retorna a cor do pixel da marca (null se for apenas fundo).
const shapeColor = (x, y) => {
  // seta ascendente (com ponta em V)
  if (
    inSeg(x, y, 146, 120, 238, 52, 13) ||
    inSeg(x, y, 238, 52, 221, 47, 11) ||
    inSeg(x, y, 238, 52, 231, 66, 11)
  ) {
    return BARS_COLOR;
  }

  // gráfico de barras
  for (const [x0, y0, x1, y1] of BARS) {
    if (x >= x0 && x < x1 && y >= y0 && y <= y1) return BARS_COLOR;
  }

  // rolo de papel
  if (inCircle(x, y, 46, 150, 13)) return PAPER_COLOR;
  if (inCircle(x, y, 46, 150, 5)) return PAPER_DOT;

  // tela do caixa
  if (inRoundRect(x, y, 58, 118, 116, 146, 8)) return SCREEN_COLOR;

  // código de barras na tela
  for (const [bx, bw] of BARCODE) {
    if (x >= bx && x < bx + bw && y >= 124 && y < 140) return SCREEN_MARK;
  }

  // teclado
  if (
    inCircle(x, y, 92, 158, 4) ||
    inCircle(x, y, 106, 158, 4) ||
    inCircle(x, y, 92, 172, 4) ||
    inCircle(x, y, 106, 172, 4)
  ) {
    return KEYPAD_COLOR;
  }

  // gaveta aberta
  if (inRoundRect(x, y, 44, 176, 100, 206, 8)) return DRAWER_COLOR;
  if (inCircle(x, y, 72, 191, 5)) return KEYHOLE_COLOR;
  if (x >= 66 && x <= 78 && y >= 195 && y <= 204) return KEYHOLE_COLOR;

  // corpo do caixa (desenhado por ultimo: fica por baixo das partes sobrepostas)
  if (inRoundRect(x, y, 44, 146, 132, 188, 10)) return BODY_COLOR;

  return null;
};

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;

for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filtro none
  for (let x = 0; x < SIZE; x++) {
    let cover = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        if (inRounded(px, py)) {
          cover++;
          const shape = shapeColor(px, py);
          if (shape) {
            r += shape[0];
            g += shape[1];
            b += shape[2];
          } else {
            const t = (px + py) / (2 * (SIZE - 1));
            r += FROM[0] + (TO[0] - FROM[0]) * t;
            g += FROM[1] + (TO[1] - FROM[1]) * t;
            b += FROM[2] + (TO[2] - FROM[2]) * t;
          }
        }
      }
    }
    const total = SS * SS;
    const alpha = Math.round((cover / total) * 255);
    raw[p++] = cover ? Math.round(r / cover) : 0;
    raw[p++] = cover ? Math.round(g / cover) : 0;
    raw[p++] = cover ? Math.round(b / cover) : 0;
    raw[p++] = alpha;
  }
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`icon.png gerado: ${out} (${png.length} bytes)`);
