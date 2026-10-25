import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Aynı ağdaki telefon/tabletten test için tüm arayüzlerde dinle.
    host: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  preview: { port: 4173, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'physics';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          return undefined;
        },
      },
    },
  },
});
