// Gera os ícones do PWA sem depender de nenhuma ferramenta de imagem externa:
// desenha um "botão de play" dourado sobre fundo azul com o pngjs (que já
// vem como dependência do qrcode).
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

function makeIcon(size, file) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2, cy = size / 2;
  const R = size * 0.46;

  // triângulo de play apontando para a direita
  const tx0 = size * 0.40, ty0 = size * 0.30;   // topo
  const tx1 = size * 0.40, ty1 = size * 0.70;   // base
  const tx2 = size * 0.72, ty2 = size * 0.50;   // ponta

  const inTriangle = (x, y) => {
    const s = (ty1 - ty0) * (x - tx0) - (tx1 - tx0) * (y - ty0);
    const t = (ty2 - ty1) * (x - tx1) - (tx2 - tx1) * (y - ty1);
    const u = (ty0 - ty2) * (x - tx2) - (tx0 - tx2) * (y - ty2);
    return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      const d = Math.hypot(x - cx, y - cy);
      let r = 0, g = 0, b = 0, a = 0;
      if (d <= R) {
        // fundo em degradê azul
        const t = y / size;
        r = Math.round(30 + t * 10);
        g = Math.round(39 + t * 12);
        b = Math.round(80 + t * 20);
        a = 255;
        // aro dourado
        if (d >= R - size * 0.035) { r = 255; g = 210; b = 62; }
        // triângulo dourado
        if (inTriangle(x, y)) { r = 255; g = 210; b = 62; }
      }
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
  console.log('gerado', file);
}

mkdirSync('public', { recursive: true });
makeIcon(192, 'public/icon-192.png');
makeIcon(512, 'public/icon-512.png');
makeIcon(180, 'public/apple-touch-icon.png');
