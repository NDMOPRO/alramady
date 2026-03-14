import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-'))) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
            if (id.includes('react-virtuoso')) return 'vendor-virtuoso';
            if (id.includes('@radix-ui')) return 'vendor-ui';
            if (id.includes('lucide-react')) return 'vendor-icons';
          }
        },
      },
    },
    chunkSizeWarningLimit: 420,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://gateway-production-b06b.up.railway.app',
        changeOrigin: true,
      },
    },
  },
});
