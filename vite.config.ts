import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      // Forward /api/* to vercel dev (port 3000) when running plain vite.
      // Not needed when using `npm run dev` (vercel dev handles everything).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-pdf': ['pdfjs-dist', 'jspdf', 'html2canvas'],
          'vendor-ai': ['@google/genai'],
          'vendor-ui': ['react', 'react-dom', 'lucide-react'],
        },
      },
    },
  },
});
