import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SYNAPSE Paper Theater · Vite config
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@stores': path.resolve(__dirname, 'src/stores'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allow access through Genspark sandbox proxy
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          react: ['react', 'react-dom'],
          motion: ['framer-motion', 'gsap'],
        },
      },
    },
  },
});
