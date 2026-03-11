import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function getVendorChunkName(id: string): string | undefined {
  const marker = `${path.sep}node_modules${path.sep}`;
  const index = id.lastIndexOf(marker);
  if (index === -1) return undefined;
  const modulePath = id.slice(index + marker.length);
  const parts = modulePath.split(path.sep);
  const firstPart = parts[0] || '';
  const packageName = firstPart.charAt(0) === '@'
    ? `${parts[0]}-${parts[1] || 'pkg'}`
    : parts[0];
  if (!packageName) return 'vendor';
  return `vendor-${packageName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          return getVendorChunkName(id);
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
