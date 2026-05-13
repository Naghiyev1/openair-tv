import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths make the app work on any GitHub Pages repo name:
  // https://yourname.github.io/whatever-repo-name/
  base: './',
  plugins: [react()],
});
