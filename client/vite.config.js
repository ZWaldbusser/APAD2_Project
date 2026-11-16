import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// All browser API traffic uses the same Flask adapters in development and production.
// /user-api: dev-only proxy to the Users service until it is routed through Flask.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    envDir: '..',
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: {
      allowedHosts: ['localhost'],
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://127.0.0.1:5050',
          changeOrigin: true,
        },
      },
    },
  };
});