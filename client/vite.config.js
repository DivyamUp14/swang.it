import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy Jitsi locally to avoid CORS when loading external_api.js
// When using ngrok, the proxy will use the ngrok Jitsi URL
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok.io',
      'localhost'
    ],
    proxy: {
      '/jitsi': {
        // Use ngrok Jitsi URL if VITE_JITSI_DOMAIN is set, otherwise use localhost
        target: process.env.VITE_JITSI_DOMAIN && !process.env.VITE_JITSI_DOMAIN.includes('localhost') && !process.env.VITE_JITSI_DOMAIN.includes('127.0.0.1')
          ? `https://${process.env.VITE_JITSI_DOMAIN.replace(/^https?:\/\//, '')}`
          : 'http://localhost:8088',
        changeOrigin: true,
        secure: true, // Required for HTTPS ngrok URLs
        rewrite: (path) => path.replace(/^\/jitsi/, ''),
      },
      // Proxy backend API requests through frontend (optional, for ngrok)
      // This allows backend to be accessed via the frontend ngrok URL
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Socket.IO connections (supports WebSocket upgrades)
      '/socket.io': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
})


