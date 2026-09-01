import { defineConfig } from 'vite';

export default defineConfig({
  // caminhos relativos: funciona em subpasta (ex.: seudominio.com/corrida/)
  base: './',
  server: {
    host: true,
    port: 5183,
  },
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1600,
  },
});
