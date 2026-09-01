// Leitor de QR Code usando a câmera do próprio aparelho.
//
// Usa jsQR em vez da BarcodeDetector nativa porque o Safari do iOS não
// implementa a API — e o iPhone é justamente o alvo principal do jogo.
// A câmera exige contexto seguro (HTTPS ou localhost); em HTTP puro o
// getUserMedia nem existe, e aí caímos direto no aviso para digitar o código.
import jsQR from 'jsqr';

// Extrai o código da sala tanto de um link completo quanto de um texto solto.
export function codeFromScan(text) {
  if (!text) return null;
  try {
    const url = new URL(text);
    const room = url.searchParams.get('room');
    if (room) return room.toUpperCase().replace(/[^A-Z0-9]/g, '');
  } catch (_) {
    // não era uma URL; segue para o formato solto
  }
  const bare = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length >= 4 && bare.length <= 8 ? bare : null;
}

const cameraSupported = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// Abre o leitor em tela cheia. Resolve com o código lido, ou null se o
// usuário fechou / a câmera não pôde ser usada.
export function openScanner() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.innerHTML = `
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-frame"></div>
      <div class="scan-hint" id="scan-hint">Aponte para o QR Code do seu amigo</div>
      <button class="btn ghost scan-close">FECHAR</button>
    `;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('.scan-video');
    const hint = overlay.querySelector('#scan-hint');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let stream = null;
    let raf = 0;
    let done = false;

    const finish = (code) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
      resolve(code);
    };

    overlay.querySelector('.scan-close').addEventListener('click', () => finish(null));

    const tick = () => {
      if (done) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
        // limita a resolução analisada: em 4K o jsQR engasga no celular
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        const code = found && codeFromScan(found.data);
        if (code) {
          hint.textContent = '✓ Sala ' + code;
          overlay.querySelector('.scan-frame').classList.add('ok');
          setTimeout(() => finish(code), 350);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    if (!cameraSupported()) {
      hint.textContent = 'Este navegador não libera a câmera aqui. Digite o código.';
      setTimeout(() => finish(null), 2600);
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    }).then((s) => {
      if (done) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      // o iOS só começa a decodificar depois do play() explícito
      video.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    }).catch((err) => {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      hint.textContent = denied
        ? 'Permissão de câmera negada. Digite o código da sala.'
        : 'Não achei uma câmera disponível. Digite o código.';
      setTimeout(() => finish(null), 3000);
    });
  });
}
