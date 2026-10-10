// Generates the PNG/SVG icons from scripts/logo.js (original artwork, no copyrighted assets). Run: npm run icons
const sharp = require("sharp"); const fs = require("fs"); const path = require("path"); const { icon } = require("./logo");
const out = path.join(__dirname, "..", "public", "icons"); fs.mkdirSync(out, { recursive: true });
(async () => {
  const jobs = [["icon-192.png", 192, 0, true], ["icon-512.png", 512, 0, true], ["maskable-512.png", 512, 64, false], ["apple-touch-icon.png", 180, 0, false], ["favicon-32.png", 32, 0, true]];
  for (const [name, size, pad, rounded] of jobs) await sharp(Buffer.from(icon(size, pad, rounded))).png().toFile(path.join(out, name));
  fs.writeFileSync(path.join(out, "icon.svg"), icon(512, 0, true));
  console.log("✔ icons written to public/icons");
})();
