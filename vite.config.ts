import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/api.ts';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), apiPlugin({ trueForgeUrl: env.VITE_TRUEFORGE_URL, trueForgeApiKey: env.TRUEFORGE_API_KEY })],
    server: {
      proxy: {
        '/api/trueforge': {
          target: env.VITE_TRUEFORGE_URL || 'http://localhost:8790',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/trueforge/, '/api/v1'),
          ...(env.TRUEFORGE_API_KEY ? { headers: { Authorization: `Bearer ${env.TRUEFORGE_API_KEY}` } } : {}),
        },
      },
    },
  };
});
