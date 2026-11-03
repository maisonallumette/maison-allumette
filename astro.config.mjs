import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
// Site 100 % statique : rapide, peu coûteux, facile à héberger.
export default defineConfig({ site: 'https://maisonallumette.fr', vite: { plugins: [tailwindcss()] } });
