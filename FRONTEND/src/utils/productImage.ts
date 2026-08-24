function escapeSvg(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function colorFor(value: string) {
  const colors = ["#2563eb", "#0891b2", "#059669", "#7c3aed", "#db2777", "#ea580c"];
  const hash = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function imageHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function productImagePath(name: string, code = "") {
  const identity = `${code.trim()}|${name.trim()}`;
  return `./product-images/${imageHash(identity)}.png`;
}

export function generateProductImage(name: string, code = "") {
  const cleanName = name.trim() || "Produto";
  const words = cleanName.split(/\s+/).slice(0, 4);
  const firstLine = escapeSvg(words.slice(0, 2).join(" ").slice(0, 22));
  const secondLine = escapeSvg(words.slice(2).join(" ").slice(0, 22));
  const initial = escapeSvg(cleanName.charAt(0).toUpperCase());
  const color = colorFor(`${cleanName}|${code}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
    <rect width="720" height="720" rx="72" fill="#f8fafc"/>
    <circle cx="360" cy="270" r="170" fill="${color}" opacity="0.12"/>
    <rect x="218" y="132" width="284" height="284" rx="56" fill="${color}"/>
    <path d="M278 214h164l-18 142H296zM316 214c0-54 88-54 88 0" fill="none" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="360" y="316" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="white">${initial}</text>
    <text x="360" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#0f172a">${firstLine}</text>
    ${secondLine ? `<text x="360" y="552" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="600" fill="#475569">${secondLine}</text>` : ""}
    <text x="360" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#64748b">${escapeSvg(code)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
