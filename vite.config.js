import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // caminhos relativos: funciona em subpasta (ex.: usuario.github.io/repo/)
  base: './',
  server: {
    host: true,
    port: 5183,
  },
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    // "Adicionar à tela de início" + jogo abrindo offline.
    // O multiplayer continua exigindo internet (signaling do WebRTC), mas o
    // treino solo funciona 100% sem rede depois da primeira visita.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Party Hub',
        short_name: 'Party Hub',
        description: 'Mini jogos multiplayer para jogar com amigos, direto no navegador.',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#141a33',
        theme_color: '#141a33',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // o bundle do Phaser passa de 2 MB
        navigateFallback: 'index.html',
      },
    }),
  ],
});
