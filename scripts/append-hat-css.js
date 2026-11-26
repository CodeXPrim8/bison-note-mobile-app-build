const fs = require('fs')
const p = 'c:/Users/clemx/OneDrive/Desktop/Bison note mobile-app-build/app/globals.css'
let css = fs.readFileSync(p, 'utf8')
const marker = '/* === CSS Santa hat + photo blend fixes === */'
if (css.includes(marker)) {
  console.log('skip')
  process.exit(0)
}
const block = `

${marker}
.bu-css-santa-hat {
  position: absolute;
  left: 48%;
  top: -0.78em;
  width: 0.92em;
  height: 0.78em;
  transform: translateX(-42%) rotate(-22deg);
  pointer-events: none;
  z-index: 3;
  filter: drop-shadow(0 2px 3px rgba(7, 16, 31, 0.35));
}
.bu-css-santa-hat::before {
  content: '';
  position: absolute;
  left: 18%;
  top: 0;
  width: 62%;
  height: 68%;
  border-radius: 55% 55% 18% 42% / 70% 70% 20% 30%;
  background: linear-gradient(145deg, #ef4444, #b91c1c);
  box-shadow: inset -2px -2px 0 rgba(0,0,0,0.12);
}
.bu-css-santa-hat::after {
  content: '';
  position: absolute;
  left: 4%;
  bottom: 8%;
  width: 92%;
  height: 28%;
  border-radius: 999px;
  background: #f8fafc;
  box-shadow: 0 -0.18em 0 -0.05em #fff inset, 72% -0.42em 0 -0.12em #fff;
}
.bu-site-brand .bu-css-santa-hat {
  width: 1.05em;
  height: 0.88em;
  top: -0.82em;
}
.bu-site-header .bu-css-santa-hat {
  width: 0.95em;
  height: 0.8em;
  top: -0.7em;
}

.bu-season-photo {
  position: absolute;
  pointer-events: none;
  user-select: none;
  mix-blend-mode: multiply;
  opacity: 0.92;
  filter: contrast(1.08) saturate(1.05);
}
.bu-season-snowflake {
  top: 9%;
  right: 11%;
  width: 52px;
  animation: bu-xmas-twinkle 3.2s ease-in-out infinite;
}
.bu-season-tree {
  right: 0.5%;
  bottom: 4%;
  width: 124px;
  animation: bu-float-bob 8s ease-in-out infinite;
}
.bu-season-cane {
  left: 2%;
  bottom: 14%;
  width: 40px;
  transform: rotate(-16deg);
  animation: bu-float-bob 7s ease-in-out -1.5s infinite;
}

.bu-xmas-chariot-brand {
  position: absolute;
  left: 40px;
  top: 12px;
  z-index: 2;
  font-size: 11px;
  font-weight: 800;
  color: #fde68a;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35);
}
.bu-xmas-santa-cane {
  position: absolute;
  right: -2px;
  top: 28px;
  width: 7px;
  height: 34px;
  border-radius: 999px;
  background: repeating-linear-gradient(180deg, #ef4444 0 6px, #fff 6px 11px);
  transform: rotate(14deg);
  box-shadow: 0 4px 8px rgba(7,16,31,0.25);
}
.bu-xmas-santa-cane::before {
  content: '';
  position: absolute;
  left: -5px;
  top: -6px;
  width: 14px;
  height: 10px;
  border: 3px solid #ef4444;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: transparent;
}

@media (max-width: 767px) {
  .bu-season-tree { width: 88px; }
  .bu-season-cane { width: 32px; }
  .bu-season-snowflake { width: 40px; }
}
`
fs.writeFileSync(p, css.trimEnd() + block + '\n', 'utf8')
console.log('appended')
