import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    allowedHosts: ['localhost'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
      },
      '/hw-proxy': {
        target: 'https://hardware-app.nicecoast-3095250d.westus.azurecontainerapps.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hw-proxy/, ''),
        secure: true,
      },
      '/proj-proxy': {
        target: 'https://projects-api.jollypond-07d76cbc.northcentralus.azurecontainerapps.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proj-proxy/, ''),
        secure: true,
      },
    },
  },
})