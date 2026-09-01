import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 3000,
    open: false
  },
  resolve: {
    alias: {
      '@vibe/spatial-core': path.resolve(__dirname, '../../packages/spatial-core/src'),
      '@vibe/closed-loop': path.resolve(__dirname, '../../packages/closed-loop/src'),
      '@vibe/semantic-ai': path.resolve(__dirname, '../../packages/semantic-ai/src')
    }
  }
});
