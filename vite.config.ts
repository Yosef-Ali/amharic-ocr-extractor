import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
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
