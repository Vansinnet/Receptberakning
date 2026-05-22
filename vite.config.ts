import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const CSP_DEV = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "object-src 'none'; manifest-src 'self'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests";

const CSP_PROD = "default-src 'none'; script-src 'self'; style-src 'self'; " +
  "img-src 'self'; font-src 'self'; connect-src 'self'; " +
  "object-src 'none'; manifest-src 'self'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}', 'data/drugs-version.json'],
        runtimeCaching: [{
          urlPattern: /\/data\/drugs\.json/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'drugs-data' }
        }]
      }
    }),
    {
      name: 'csp-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Content-Security-Policy', CSP_DEV);
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Content-Security-Policy', CSP_PROD);
          next();
        });
      }
    }
  ],
  build: {
    target: 'es2022'
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '$lib': '/src/lib'
    }
  }
});
