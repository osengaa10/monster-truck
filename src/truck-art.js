// Side-view SVG picture of a monster truck for the pick-your-truck screen.
// `id` keeps gradient ids unique when several pictures share the page.

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function wheel(cx, cy, accent) {
  const lugs = [];
  for (let i = 0; i < 16; i++) {
    lugs.push(`<rect x="${cx - 5}" y="${cy - 34}" width="10" height="8" rx="2" transform="rotate(${i * 22.5} ${cx} ${cy})"/>`);
  }
  const nuts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    nuts.push(`<circle cx="${(cx + Math.cos(a) * 7.5).toFixed(1)}" cy="${(cy + Math.sin(a) * 7.5).toFixed(1)}" r="1.6"/>`);
  }
  return `
    <g fill="#1d1d1d">${lugs.join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="29" fill="#1d1d1d"/>
    <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#333" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="15" fill="#d8dde3"/>
    <circle cx="${cx}" cy="${cy}" r="11.5" fill="#9aa3ad"/>
    <g fill="#2a2a2a">${nuts.join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="4.5" fill="${accent}"/>
    <path d="M${cx - 11} ${cy - 6} A12 12 0 0 1 ${cx - 2} ${cy - 12}" stroke="#fff" stroke-width="2" fill="none" opacity="0.7"/>`;
}

function flames(id) {
  const tongues = [70, 100, 82, 108, 64];
  return tongues.map((len, i) => {
    const y = 67 + i * 5.2;
    const x = 172;
    return `<path d="M${x} ${y - 3} C${x - len * 0.4} ${y - 5} ${x - len * 0.75} ${y + 2} ${x - len} ${y - 3}
      C${x - len * 0.7} ${y + 4} ${x - len * 0.35} ${y + 5} ${x} ${y + 3}Z"
      fill="url(#flame${id})" stroke="#7a1500" stroke-width="1"/>`;
  }).join('');
}

export function truckSvg(colors, id) {
  const body = hex(colors.body);
  const accent = hex(colors.accent);
  return `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="flame${id}" x1="1" x2="0" y1="0" y2="0">
      <stop offset="0" stop-color="#fff36b"/>
      <stop offset="0.35" stop-color="#ffb300"/>
      <stop offset="0.8" stop-color="#ff3d00"/>
      <stop offset="1" stop-color="#c41c00"/>
    </linearGradient>
    <linearGradient id="shine${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.18"/>
    </linearGradient>
  </defs>

  <!-- shadow -->
  <ellipse cx="100" cy="150" rx="84" ry="6" fill="#000" opacity="0.18"/>

  <!-- smoke puffs and exhaust stacks -->
  <circle cx="52" cy="10" r="6" fill="#c9c9c9" opacity="0.8"/>
  <circle cx="42" cy="5" r="4" fill="#d9d9d9" opacity="0.7"/>
  <circle cx="64" cy="13" r="4" fill="#bdbdbd" opacity="0.8"/>
  <rect x="58" y="18" width="7" height="44" rx="2" fill="#d8dde3"/>
  <rect x="58" y="18" width="2.5" height="44" fill="#fff" opacity="0.6"/>
  <rect x="57" y="16" width="9" height="5" rx="1" fill="#2a2a2a"/>

  <!-- frame and shocks -->
  <rect x="38" y="92" width="128" height="9" rx="2" fill="#2a2a2a"/>
  <rect x="60" y="86" width="8" height="26" rx="3" fill="${accent}" stroke="#2a2a2a" stroke-width="1"/>
  <rect x="134" y="86" width="8" height="26" rx="3" fill="${accent}" stroke="#2a2a2a" stroke-width="1"/>

  <!-- pickup bed and roll bar -->
  <path d="M34 60 L34 40 Q34 36 38 36 L66 36" stroke="#d8dde3" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="28" y="50" width="48" height="12" rx="3" fill="${body}"/>

  <!-- main body -->
  <path d="M28 64 Q28 58 34 58 L130 58 L172 63 Q179 64 179 71 L179 88 Q179 94 173 94 L34 94 Q28 94 28 88Z" fill="${body}"/>
  <rect x="28" y="84" width="151" height="5" fill="${accent}"/>
  ${flames(id)}
  <path d="M28 64 Q28 58 34 58 L130 58 L172 63 Q179 64 179 71 L179 88 Q179 94 173 94 L34 94 Q28 94 28 88Z" fill="url(#shine${id})"/>
  <line x1="88" y1="62" x2="88" y2="84" stroke="#000" stroke-opacity="0.35" stroke-width="1.2"/>
  <line x1="124" y1="62" x2="124" y2="84" stroke="#000" stroke-opacity="0.35" stroke-width="1.2"/>
  <rect x="113" y="64" width="8" height="2.5" rx="1" fill="#d8dde3"/>

  <!-- front: headlight, grille, bumper; back: tail light, bumper -->
  <rect x="172" y="68" width="8" height="9" rx="2" fill="#fff3a0" stroke="#d8dde3" stroke-width="1.5"/>
  <rect x="166" y="90" width="18" height="8" rx="3" fill="#d8dde3"/>
  <rect x="24" y="90" width="14" height="8" rx="3" fill="#d8dde3"/>
  <rect x="26" y="66" width="5" height="8" rx="1" fill="#ff2a2a"/>

  <!-- cab -->
  <path d="M76 60 L80 31 Q81 26 87 26 L120 26 Q126 26 128 32 L138 60Z" fill="${body}"/>
  <path d="M76 60 L80 31 Q81 26 87 26 L120 26 Q126 26 128 32 L138 60Z" fill="url(#shine${id})"/>
  <rect x="80" y="22" width="46" height="5" rx="2" fill="${accent}"/>
  <rect x="88" y="16" width="30" height="5" rx="1.5" fill="#2a2a2a"/>
  <rect x="91" y="12.5" width="7" height="4" rx="1" fill="#fff3a0"/>
  <rect x="100" y="12.5" width="7" height="4" rx="1" fill="#fff3a0"/>
  <rect x="109" y="12.5" width="7" height="4" rx="1" fill="#fff3a0"/>
  <path d="M86 32 L121 32 Q124 32 125 36 L131 55 L83 55Z" fill="#9fe3ff"/>
  <path d="M110 32 L117 32 L104 55 L97 55Z" fill="#fff" opacity="0.45"/>
  <rect x="133" y="40" width="7" height="9" rx="2" fill="${body}" stroke="#2a2a2a" stroke-width="1"/>

  <!-- happy face in the window -->
  <circle cx="100" cy="44" r="7.5" fill="#fff" stroke="#2a2a2a" stroke-width="1"/>
  <circle cx="116" cy="44" r="7.5" fill="#fff" stroke="#2a2a2a" stroke-width="1"/>
  <circle cx="103" cy="45" r="3.6" fill="#111"/>
  <circle cx="119" cy="45" r="3.6" fill="#111"/>
  <circle cx="104.2" cy="43.6" r="1.2" fill="#fff"/>
  <circle cx="120.2" cy="43.6" r="1.2" fill="#fff"/>
  <path d="M93 35 Q100 31 106 34" stroke="#111" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M110 34 Q116 31 123 35" stroke="#111" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <!-- wheels -->
  ${wheel(52, 116, accent)}
  ${wheel(150, 116, accent)}
</svg>`;
}
