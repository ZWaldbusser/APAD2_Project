import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// All browser API traffic uses the same Flask adapters in development and production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', 'VITE_');
  const proxy = Object.fromEntries(
    ['/api']
      .map((path) => [path, { target: env.VITE_API_BASE_URL || 'http://127.0.0.1:5050', changeOrigin: true }]),
  );
  return {
    envDir: '..',
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: { allowedHosts: ['localhost'], proxy },
  };
});
