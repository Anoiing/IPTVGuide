import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { replaceCodePlugin } from 'vite-plugin-replace';
import packageJson from './package.json';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    replaceCodePlugin({
      replacements: [
        {
          from: '__CLI_VERSION__',
          to: packageJson.version,
        },
      ],
    }),
    svelte(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
