// Mini-linguagem de formas compartilhada pelos dois renderizadores do
// personagem: o SVG das telas e a textura de canvas usada nas partidas.
//
// Cada cosmético é descrito UMA vez como uma lista de formas; os dois
// desenhistas interpretam a mesma lista. Sem isso, cada peça precisaria ser
// escrita duas vezes e as duas versões inevitavelmente divergiriam.
//
// Sistema de coordenadas: o boneco vive num quadro de 76 × 104.
// Corpo: x 11..65, y 24..96. Olhos na altura y ≈ 42.

export const OUTLINE = 0x1c2440;

// atalhos para montar as formas
export const R = (x, y, w, h, r, c, a) => ({ t: 'r', x, y, w, h, r, c, a });
export const C = (x, y, r, c, a) => ({ t: 'c', x, y, r, c, a });
export const E = (x, y, rx, ry, c, a) => ({ t: 'e', x, y, rx, ry, c, a });
export const T = (x1, y1, x2, y2, x3, y3, c, a) => ({ t: 't', p: [x1, y1, x2, y2, x3, y3], c, a });
export const L = (x1, y1, x2, y2, w, c, a) => ({ t: 'l', p: [x1, y1, x2, y2], w, c, a });
export const A = (x, y, r, w, c, a) => ({ t: 'a', x, y, r, w, c, a });   // arco superior (sorrisos)

// Cores podem ser número (0xRRGGBB) ou um papel da paleta do personagem.
function resolve(c, pal) {
  if (typeof c === 'number') return c;
  return (pal && pal[c] !== undefined) ? pal[c] : OUTLINE;
}
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ SVG
export function partsToSVG(parts, pal) {
  if (!parts || !parts.length) return '';
  return parts.map(p => {
    const c = hex(resolve(p.c, pal));
    const op = p.a !== undefined ? ` opacity="${p.a}"` : '';
    switch (p.t) {
      case 'r': return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r || 0}" fill="${c}"${op}/>`;
      case 'c': return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${c}"${op}/>`;
      case 'e': return `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="${c}"${op}/>`;
      case 't': return `<path d="M${p.p[0]} ${p.p[1]} L${p.p[2]} ${p.p[3]} L${p.p[4]} ${p.p[5]} Z" fill="${c}"${op}/>`;
      case 'l': return `<line x1="${p.p[0]}" y1="${p.p[1]}" x2="${p.p[2]}" y2="${p.p[3]}" stroke="${c}" stroke-width="${p.w}" stroke-linecap="round"${op}/>`;
      case 'a': return `<path d="M${p.x - p.r} ${p.y} a ${p.r} ${p.r} 0 0 1 ${p.r * 2} 0" fill="none" stroke="${c}" stroke-width="${p.w}" stroke-linecap="round"${op}/>`;
      default: return '';
    }
  }).join('');
}

// ------------------------------------------------------------------ canvas
// `g` é um Phaser.GameObjects.Graphics.
export function drawParts(g, parts, pal) {
  if (!parts || !parts.length) return;
  for (const p of parts) {
    const c = resolve(p.c, pal);
    const a = p.a !== undefined ? p.a : 1;
    switch (p.t) {
      case 'r':
        g.fillStyle(c, a);
        if (p.r) g.fillRoundedRect(p.x, p.y, p.w, p.h, p.r);
        else g.fillRect(p.x, p.y, p.w, p.h);
        break;
      case 'c': g.fillStyle(c, a); g.fillCircle(p.x, p.y, p.r); break;
      // Phaser mede a elipse pela largura/altura totais, o SVG pelos raios
      case 'e': g.fillStyle(c, a); g.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2); break;
      case 't': g.fillStyle(c, a); g.fillTriangle(...p.p); break;
      case 'l': g.lineStyle(p.w, c, a); g.lineBetween(...p.p); break;
      case 'a':
        g.lineStyle(p.w, c, a);
        g.beginPath();
        g.arc(p.x, p.y, p.r, Math.PI, 0, true);
        g.strokePath();
        break;
    }
  }
}
