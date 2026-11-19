import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  resolve: { preserveSymlinks: true },
  server: {
    proxy: { '/ws': { target: 'ws://127.0.0.1:3000', ws: true } },
  },
  build: { rollupOptions: { input: { main: 'index.html', development: 'development.html' } } },
});
