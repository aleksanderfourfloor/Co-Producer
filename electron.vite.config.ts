import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const aliases = {
  '@shared': resolve(__dirname, 'packages/shared/src'),
  '@core': resolve(__dirname, 'packages/core/src')
};

export default defineConfig({
  main: {
    resolve: {
      alias: aliases
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['ws', 'bufferutil', 'utf-8-validate'],
        input: {
          index: resolve(__dirname, 'apps/desktop/src/main/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: aliases
    },
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        external: ['ws', 'bufferutil', 'utf-8-validate'],
        input: {
          index: resolve(__dirname, 'apps/desktop/src/main/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'apps/desktop/src/renderer'),
    resolve: {
      alias: aliases
    },
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'apps/desktop/src/renderer/index.html')
        }
      }
    }
  }
});
