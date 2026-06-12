import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Project Pages serve from a subpath (https://alireza29675.github.io/desk/), so
// every asset URL must be prefixed with `/desk/` or it 404s. Runtime paths use
// import.meta.env.BASE_URL. If a custom domain is added later, set base back to
// '/' and add a CNAME.
export default defineConfig({
  base: '/desk/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // og.html is the social-preview template — screenshotted at 1280×640 for
      // the repo's social card and the og:image meta tag.
      input: {
        main: 'index.html',
        og: 'og.html',
      },
    },
  },
});
