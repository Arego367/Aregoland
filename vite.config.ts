import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 443,
    https: true,
    hmr: {
      overlay: false,
    },
    proxy: {
      // WebSocket Signaling über HTTPS/WSS proxy (kein mixed-content Problem)
      '/ws-signal': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
        rewrite: () => '/',
      },
      // Kurzcode HTTP API
      '/code': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    // HTTPS erforderlich für WebCrypto API (crypto.subtle)
    basicSsl(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
})
