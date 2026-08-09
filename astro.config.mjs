import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://jonasaaydn.github.io',
  base: '/fsae-mbd/',
  integrations: [
    mdx(),
    sitemap({
      // 更新頻度・優先度のヒント（Google へのクロール指示）
      changefreq: 'daily',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
    },
  },
});
