// Generates PNG app icons from an original SVG (no copyrighted assets). Run: npm run icons
const sharp = require("sharp"); const fs = require("fs"); const path = require("path");
const out = path.join(__dirname, "..", "public", "icons"); fs.mkdirSync(out, { recursive: true });
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c83ff"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
<rect width="512" height="512" fill="#0f1115"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
<rect x="56" y="56" width="400" height="400" rx="96" fill="url(#g)"/>
<path d="M176 148v168h136" fill="none" stroke="#0b0c10" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="338" cy="176" r="26" fill="#0b0c10"/></g></svg>`;
(async () => {
  const jobs = [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["maskable-512.png", 512, 70], ["apple-touch-icon.png", 180, 0]];
  for (const [name, size, pad] of jobs) await sharp(Buffer.from(svg(size, pad))).png().toFile(path.join(out, name));
  fs.writeFileSync(path.join(out, "icon.svg"), svg(512, 0));
  console.log("✔ icons written to public/icons");
})();
