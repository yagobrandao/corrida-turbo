// Arte procedural da plataforma: personagem do jogador e thumbnails dos
// jogos, tudo SVG inline — nenhum asset externo, e as cores vêm das mesmas
// tabelas que pintam os personagens dentro das partidas.
import { getSkin } from '../games/runner/skins.js';
import { partsToSVG } from '../core/shapes.js';
import { backParts, frontParts, faceParts, mouthParts, bodyColor } from '../core/cosmetics.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// mistura com branco (amt>0) ou preto (amt<0) — espelho do shade() das texturas
function shade(n, amt) {
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

const OUTLINE = '#1c2440';

// ------------------------------------------------------------------
// Personagem (mesma anatomia do runner: cápsula + barriga + adereço)
// ------------------------------------------------------------------
export function charSVG(skinId, { size = 120, tint = null, blink = true, cos = null } = {}) {
  const skin = getSkin(skinId);
  // cor: o tinte do slot manda (salas); senão a cor cosmética; senão a da skin
  const override = tint !== null ? tint : bodyColor(cos);
  const has = override !== null && override !== undefined;
  const pal = {
    body: has ? override : skin.body,
    belly: has ? shade(override, 0.45) : skin.belly,
    accent: has ? shade(override, -0.35) : skin.accent,
    outline: 0x1c2440,
  };
  const body = hex(pal.body), accent = hex(pal.accent), belly = hex(pal.belly);

  let feature = '';
  switch (skin.feature) {
    case 'ears':
      feature = `
        <circle cx="22" cy="16" r="12" fill="${OUTLINE}"/><circle cx="54" cy="16" r="12" fill="${OUTLINE}"/>
        <circle cx="22" cy="16" r="9" fill="${body}"/><circle cx="54" cy="16" r="9" fill="${body}"/>
        <circle cx="22" cy="16" r="4.5" fill="${accent}"/><circle cx="54" cy="16" r="4.5" fill="${accent}"/>`;
      break;
    case 'antenna':
      feature = `
        <rect x="35" y="2" width="6" height="22" rx="3" fill="${OUTLINE}"/>
        <circle cx="38" cy="5" r="9" fill="${OUTLINE}"/><circle cx="38" cy="5" r="6.5" fill="${accent}"/>
        <circle cx="35.5" cy="2.5" r="2.4" fill="#fff" opacity=".6"/>`;
      break;
    case 'crown':
      feature = `
        <path d="M16 26 L21 8 L28 22 L38 4 L48 22 L55 8 L60 26 Z" fill="${OUTLINE}"/>
        <path d="M19 24 L22.5 12 L28.5 23 L38 8 L47.5 23 L53.5 12 L57 24 Z" fill="#ffd23e"/>`;
      break;
  }

  // rosto cosmético substitui o padrão quando existe
  const custom = faceParts(cos);
  const face = custom ? partsToSVG(custom, pal) : (skin.feature === 'visor'
    ? `
      <rect x="14" y="34" width="48" height="20" rx="10" fill="${OUTLINE}"/>
      <rect x="17" y="37" width="42" height="14" rx="7" fill="${accent}"/>
      <rect x="21" y="39.5" width="13" height="5.5" rx="2.7" fill="#fff" opacity=".45"/>`
    : `
      <g class="${blink ? 'ch-eyes' : ''}">
        <circle cx="28" cy="42" r="8" fill="#fff"/><circle cx="48" cy="42" r="8" fill="#fff"/>
        <circle cx="30" cy="43" r="4" fill="${OUTLINE}"/><circle cx="50" cy="43" r="4" fill="${OUTLINE}"/>
      </g>`);

  // overflow visível: pets e asas saem do quadro sem mexer no layout
  return `
  <svg viewBox="0 0 76 104" width="${size}" height="${Math.round(size * 104 / 76)}" class="char-svg" overflow="visible" aria-hidden="true">
    <ellipse cx="38" cy="99" rx="24" ry="5.5" fill="#000" opacity=".28"/>
    ${partsToSVG(backParts(cos), pal)}
    ${feature}
    <rect x="9" y="22" width="58" height="76" rx="27" fill="${OUTLINE}"/>
    <rect x="11" y="24" width="54" height="72" rx="25" fill="${body}"/>
    <rect x="20" y="58" width="36" height="32" rx="16" fill="${belly}"/>
    ${face}
    ${partsToSVG(mouthParts(cos), pal)}
    <circle cx="21" cy="52" r="4" fill="#fff" opacity=".25"/>
    <circle cx="55" cy="52" r="4" fill="#fff" opacity=".25"/>
    ${partsToSVG(frontParts(cos), pal)}
  </svg>`;
}

// ------------------------------------------------------------------
// Thumbnails dos jogos: mini-cenas, não emojis
// ------------------------------------------------------------------
function thumbWrap(accent, inner, id) {
  const dark = hex(shade(parseInt(accent.slice(1), 16), -0.55));
  return `
  <svg viewBox="0 0 160 110" class="game-art" aria-hidden="true">
    <defs>
      <linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${accent}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="110" rx="0" fill="url(#bg-${id})"/>
    <circle cx="18" cy="18" r="26" fill="#fff" opacity=".08"/>
    <circle cx="150" cy="96" r="34" fill="#000" opacity=".12"/>
    ${inner}
  </svg>`;
}

const mini = (x, y, color, s = 1, flip = false) => `
  <g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
    <ellipse cx="0" cy="21" rx="12" ry="3.4" fill="#000" opacity=".3"/>
    <rect x="-11" y="-20" width="22" height="40" rx="11" fill="${OUTLINE}"/>
    <rect x="-9.5" y="-18.5" width="19" height="37" rx="9.5" fill="${color}"/>
    <circle cx="-3.5" cy="-8" r="3.4" fill="#fff"/><circle cx="4.5" cy="-8" r="3.4" fill="#fff"/>
    <circle cx="-2.6" cy="-7.6" r="1.7" fill="${OUTLINE}"/><circle cx="5.4" cy="-7.6" r="1.7" fill="${OUTLINE}"/>
  </g>`;

const ARTS = {
  runner: (a) => thumbWrap(a, `
    <rect x="0" y="72" width="160" height="38" fill="#2b3564"/>
    <rect x="14" y="70" width="132" height="4" rx="2" fill="#ffd23e" opacity=".9"/>
    <rect x="30" y="86" width="18" height="4" rx="2" fill="#fff" opacity=".55"/>
    <rect x="72" y="86" width="18" height="4" rx="2" fill="#fff" opacity=".55"/>
    <rect x="114" y="86" width="18" height="4" rx="2" fill="#fff" opacity=".55"/>
    <g transform="translate(112 40)"><rect x="-14" y="0" width="28" height="14" rx="4" fill="#e8483f"/><rect x="-10" y="3" width="6" height="8" fill="#fff"/><rect x="2" y="3" width="6" height="8" fill="#fff"/></g>
    <circle cx="52" cy="30" r="7" fill="#ffd23e"/><circle cx="52" cy="30" r="4" fill="#ffea90"/>
    ${mini(48, 62, '#7fd0ff')}
    <path d="M20 56 q8 -3 16 0 M18 66 q8 -3 16 0" stroke="#fff" stroke-width="2.6" fill="none" opacity=".6" stroke-linecap="round"/>
  `, 'runner'),

  flappy: (a) => thumbWrap(a, `
    <rect x="26" y="0" width="22" height="34" rx="4" fill="#2f8f5b"/>
    <rect x="24" y="30" width="26" height="8" rx="3" fill="#257247"/>
    <rect x="26" y="66" width="22" height="44" rx="4" fill="#2f8f5b"/>
    <rect x="24" y="62" width="26" height="8" rx="3" fill="#257247"/>
    <rect x="112" y="0" width="22" height="20" rx="4" fill="#2f8f5b"/>
    <rect x="112" y="54" width="22" height="56" rx="4" fill="#2f8f5b"/>
    <circle cx="20" cy="88" r="8" fill="#fff" opacity=".25"/><circle cx="30" cy="92" r="6" fill="#fff" opacity=".2"/>
    ${mini(80, 46, '#ffd23e', 0.92)}
    <path d="M64 58 q-6 8 -12 10" stroke="#fff" stroke-width="2.6" fill="none" opacity=".55" stroke-linecap="round"/>
  `, 'flappy'),

  bomb: (a) => thumbWrap(a, `
    <g transform="translate(112 34)">
      <circle r="17" fill="${OUTLINE}"/><circle cx="-5" cy="-5" r="5" fill="#39426f"/>
      <rect x="-2.4" y="-26" width="5" height="10" rx="2.5" fill="#d9a410"/>
      <g fill="#ffd23e"><circle cx="2" cy="-30" r="3.4"/><circle cx="8" cy="-27" r="2.2"/><circle cx="-3" cy="-32" r="2"/></g>
    </g>
    <path d="M132 66 l8 -8 M138 78 l10 -3 M126 80 l6 8" stroke="#ffd23e" stroke-width="3.4" stroke-linecap="round"/>
    <rect x="14" y="76" width="24" height="24" rx="5" fill="#b8863e"/><rect x="17" y="79" width="18" height="18" rx="3" fill="#d9a55c"/>
    ${mini(52, 74, '#8fe6ba', 1, true)}
    <path d="M66 70 q10 -4 14 2 M64 82 q10 -4 14 2" stroke="#fff" stroke-width="2.4" fill="none" opacity=".5" stroke-linecap="round"/>
  `, 'bomb'),

  tag: (a) => thumbWrap(a, `
    <ellipse cx="80" cy="98" rx="70" ry="10" fill="#000" opacity=".15"/>
    ${mini(44, 66, '#7fd0ff', 1, true)}
    <circle cx="112" cy="60" r="24" fill="#e8483f" opacity=".2"/>
    ${mini(112, 66, '#ff8b8b')}
    <text x="112" y="34" font-size="17" text-anchor="middle">👹</text>
    <path d="M64 62 q8 -2 14 2 M62 74 q8 -2 14 2" stroke="#fff" stroke-width="2.6" fill="none" opacity=".6" stroke-linecap="round"/>
  `, 'tag'),

  td: (a) => thumbWrap(a, `
    <path d="M0 66 h48 v-30 h40 v60 h72" stroke="#c9a56b" stroke-width="22" fill="none"/>
    <g transform="translate(132 84)">
      <rect x="-14" y="-10" width="28" height="22" rx="3" fill="#d9c9a3" stroke="${OUTLINE}" stroke-width="2.5"/>
      <rect x="-14" y="-16" width="7" height="8" fill="#d9c9a3"/><rect x="7" y="-16" width="7" height="8" fill="#d9c9a3"/>
      <path d="M-4 -14 L0 -26 L4 -14 Z" fill="#e8483f"/>
    </g>
    <g transform="translate(66 22)">
      <rect x="-9" y="-4" width="18" height="22" rx="4" fill="#1b6bb0" stroke="${OUTLINE}" stroke-width="2.5"/>
      <rect x="-5" y="-14" width="10" height="12" rx="3" fill="#39a9f4"/>
    </g>
    <circle cx="30" cy="66" r="9" fill="#8fe66a" stroke="${OUTLINE}" stroke-width="2.5"/>
    <circle cx="27" cy="64" r="2" fill="${OUTLINE}"/><circle cx="34" cy="64" r="2" fill="${OUTLINE}"/>
    <path d="M60 34 L94 58" stroke="#ffd23e" stroke-width="3" stroke-linecap="round"/>
    <circle cx="94" cy="58" r="4" fill="#ffd23e"/>
  `, 'td'),

  island: (a) => thumbWrap(a, `
    <ellipse cx="80" cy="88" rx="86" ry="30" fill="#2b7fd4"/>
    <ellipse cx="80" cy="82" rx="64" ry="22" fill="#e8d194"/>
    <ellipse cx="80" cy="78" rx="48" ry="16" fill="#8fca5e"/>
    <g transform="translate(52 40)">
      <rect x="-3" y="14" width="7" height="18" rx="3" fill="#6b4a2e"/>
      <circle cx="0" cy="10" r="13" fill="#2f8f5b"/>
      <circle cx="-8" cy="4" r="7" fill="#3fae70"/><circle cx="8" cy="3" r="7" fill="#3fae70"/>
    </g>
    <g transform="translate(104 58)">
      <rect x="-8" y="4" width="16" height="5" rx="2" fill="#6b4a2e"/>
      <path d="M0 -10 L-7 6 L7 6 Z" fill="#ff8b3d"/>
      <path d="M0 -4 L-4 5 L4 5 Z" fill="#ffd23e"/>
    </g>
    ${mini(78, 62, '#7fd0ff', 0.8)}
    <circle cx="24" cy="20" r="2.6" fill="#fff" opacity=".7"/><circle cx="140" cy="26" r="2" fill="#fff" opacity=".5"/>
  `, 'island'),

  battle: (a) => thumbWrap(a, `
    <g opacity=".9">
      ${[0, 1, 2, 3, 4].map(c => [0, 1, 2].map(r =>
        `<rect x="${30 + c * 20}" y="${24 + r * 18}" width="19" height="17" rx="2" fill="${(c + r) % 2 ? '#ffffff' : '#000000'}" opacity="${(c + r) % 2 ? '.10' : '.14'}"/>`).join('')).join('')}
    </g>
    <path d="M30 51 h100" stroke="#ffd23e" stroke-width="2" opacity=".6"/>
    <g transform="translate(60 72)">
      <ellipse cx="0" cy="12" rx="12" ry="4" fill="#000" opacity=".25"/>
      <ellipse cx="0" cy="0" rx="13" ry="11" fill="#8a5a3c" stroke="${OUTLINE}" stroke-width="2.5"/>
      <rect x="-7" y="2" width="14" height="8" rx="3" fill="#6b4a2e"/>
      <path d="M-6 10 L-4 4 L-2 10 Z M6 10 L4 4 L2 10 Z" fill="#fff"/>
      <circle cx="-5" cy="-3" r="2.6" fill="#fff"/><circle cx="5" cy="-3" r="2.6" fill="#fff"/>
      <circle cx="-4.4" cy="-2.6" r="1.3" fill="${OUTLINE}"/><circle cx="5.6" cy="-2.6" r="1.3" fill="${OUTLINE}"/>
    </g>
    <g transform="translate(100 74)">
      <ellipse cx="0" cy="11" rx="10" ry="3.5" fill="#000" opacity=".25"/>
      <path d="M0 -20 L-6 -6 L6 -6 Z" fill="#ff8b3d"/><path d="M0 -15 L-3 -6 L3 -6 Z" fill="#ffd23e"/>
      <circle cx="0" cy="2" r="10" fill="#e8483f" stroke="${OUTLINE}" stroke-width="2.5"/>
      <circle cx="-4" cy="0" r="2.4" fill="#fff"/><circle cx="4" cy="0" r="2.4" fill="#fff"/>
      <circle cx="-3" cy=".4" r="1.2" fill="${OUTLINE}"/><circle cx="5" cy=".4" r="1.2" fill="${OUTLINE}"/>
    </g>
    <g transform="translate(80 34)">
      <ellipse cx="0" cy="10" rx="9" ry="3.5" fill="#000" opacity=".25"/>
      <path d="M-14 -4 L-3 2 L-5 8 Z M14 -4 L3 2 L5 8 Z" fill="#ff8b3d"/>
      <ellipse cx="0" cy="2" rx="8" ry="9" fill="#ffd23e" stroke="${OUTLINE}" stroke-width="2.5"/>
      <path d="M-3 -10 L-1 -14 L1 -9 L3 -14 L4 -9 Z" fill="#ff8b3d"/>
      <circle cx="-3" cy="-1" r="2" fill="#fff"/><circle cx="3" cy="-1" r="2" fill="#fff"/>
    </g>
    <path d="M126 14 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 Z" fill="#ffd23e"/>
    <path d="M22 88 l2 4 l4 .7 l-3 3 l.7 4 l-3.7 -2 l-3.7 2 l.7 -4 l-3 -3 l4 -.7 Z" fill="#ffd23e" opacity=".7"/>
  `, 'battle'),

  triplequest: (a) => thumbWrap(a, `
    <ellipse cx="80" cy="104" rx="70" ry="14" fill="#000" opacity=".18"/>
    <g transform="translate(20 72) rotate(-8)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#e8483f" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(52 78) rotate(4)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#2b7fd4" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(84 74) rotate(-3)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#ffd23e" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(116 80) rotate(6)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#3fae70" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(148 72) rotate(-5)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#d45de0" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(36 48) rotate(-6)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#ff8b3d" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(68 44) rotate(5)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#3ddad7" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(100 48) rotate(-4)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#ff8fc4" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(132 44) rotate(7)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#9b59d0" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(68 20) rotate(-4)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#ffd23e" stroke="${OUTLINE}" stroke-width="2"/></g>
    <g transform="translate(100 18) rotate(5)"><rect x="-15" y="-13" width="30" height="30" rx="7" fill="#000" opacity=".22"/><rect x="-16" y="-16" width="32" height="32" rx="7" fill="${OUTLINE}"/><rect x="-14" y="-14" width="28" height="28" rx="6" fill="#fdf7ec"/><circle r="7" fill="#e8483f" stroke="${OUTLINE}" stroke-width="2"/></g>
    <path d="M132 14 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 Z" fill="#ffd23e"/>
  `, 'triplequest'),

  guess: (a) => thumbWrap(a, `
    <g transform="translate(80 34)">
      <rect x="-34" y="-22" width="68" height="42" rx="12" fill="#fff"/>
      <path d="M-8 18 l6 12 l8 -12 Z" fill="#fff"/>
      <text x="0" y="10" font-size="30" font-weight="bold" text-anchor="middle" fill="${a}">?</text>
    </g>
    ${mini(44, 84, '#ffd28a', 0.9)}
    ${mini(116, 84, '#b7a5f7', 0.9, true)}
    <circle cx="24" cy="26" r="3" fill="#ffd23e"/><circle cx="140" cy="20" r="2.4" fill="#ffd23e"/><circle cx="132" cy="44" r="2" fill="#fff" opacity=".6"/>
  `, 'guess'),
};

export function gameArt(game) {
  const fn = ARTS[game.id];
  return fn ? fn(game.accent) : thumbWrap(game.accent, `<text x="80" y="66" font-size="40" text-anchor="middle">${game.emoji}</text>`, game.id);
}

// ------------------------------------------------------------------
// Nível derivado do total de moedas (cosmético — nada é gravado)
// ------------------------------------------------------------------
export function levelInfo(totalCoins) {
  const t = Math.max(0, totalCoins || 0);
  const level = Math.floor(Math.sqrt(t / 60)) + 1;
  const base = (level - 1) ** 2 * 60;
  const next = level ** 2 * 60;
  return { level, pct: Math.min(100, Math.round(((t - base) / (next - base)) * 100)), toNext: next - t };
}
