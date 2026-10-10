// Lucifer's OS logo — an original dark-fire flame. Single source of truth: used for PNG icons, favicon and the <Logo/> component.
const FLAME = "M256 34 C268 108 366 156 366 272 C366 366 316 436 256 448 C196 436 146 366 146 272 C146 212 178 176 204 138 C210 166 224 186 244 194 C236 138 242 80 256 34 Z";
const flameLayers = (id) => `
  <path d="${FLAME}" fill="url(#${id}o)"/>
  <path d="${FLAME}" fill="url(#${id}m)" transform="translate(256 448) scale(.74 .72) translate(-256 -448)"/>
  <path d="${FLAME}" fill="url(#${id}i)" transform="translate(256 448) scale(.46 .44) translate(-256 -448)"/>
  <path d="M232 262 h30 v112 h66 v30 h-96 Z" fill="#12040a" opacity=".82" transform="translate(-4 -4)"/>`;
const defs = (id) => `<defs>
  <linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f"/><stop offset=".55" stop-color="#d7160f"/><stop offset="1" stop-color="#7d0610"/></linearGradient>
  <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb02e"/><stop offset=".6" stop-color="#ff6a14"/><stop offset="1" stop-color="#d7160f"/></linearGradient>
  <linearGradient id="${id}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="1" stop-color="#ffb02e"/></linearGradient>
  <radialGradient id="${id}b" cx=".5" cy=".92" r=".75"><stop offset="0" stop-color="#5a0a10"/><stop offset=".55" stop-color="#1c0609"/><stop offset="1" stop-color="#09030a"/></radialGradient></defs>`;
const embers = `<circle cx="318" cy="96" r="7" fill="#ff8a1f"/><circle cx="196" cy="86" r="5" fill="#ff5a1f"/><circle cx="342" cy="150" r="4" fill="#ffb02e"/><circle cx="170" cy="150" r="3.5" fill="#ff6a14"/>`;
// full app icon (dark tile + flame). pad shrinks the artwork for maskable safe-zone.
const icon = (size, pad = 0, rounded = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${defs("a")}
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#ab)"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">${embers}${flameLayers("a")}</g></svg>`;
// flame only, transparent (for the in-app brand mark)
const mark = (id = "m") => `${defs(id)}<g>${embers}${flameLayers(id)}</g>`;
module.exports = { icon, mark, FLAME };
