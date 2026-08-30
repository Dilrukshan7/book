import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../site.config';

export const GET: APIRoute = async () => {
  const books = await getCollection('books');
  const availableBooks = books
    .filter((b) => b.data.status === 'available')
    .map((b) => b.data);

  const guides = await getCollection('guides');

  // Static site pages
  const staticPages = [
    '',
    '/books',
    '/about',
    '/copyright',
  ];

  const urls: { loc: string; changefreq: string; priority: string }[] = [];

  // 1. Static Pages
  staticPages.forEach((path) => {
    urls.push({
      loc: `${SITE.url}${path}`,
      changefreq: path === '' ? 'daily' : 'weekly',
      priority: path === '' ? '1.0' : '0.8',
    });
  });

  // 2. Book Roadmap Pages
  availableBooks.forEach((book) => {
    urls.push({
      loc: `${SITE.url}/books/${book.slug}`,
      changefreq: 'weekly',
      priority: '0.9',
    });
  });

  // 3. Section Study Guides
  availableBooks.forEach((book) => {
    const bookGuides = guides.filter((g) => g.id.startsWith(`${book.slug}/`));
    bookGuides.forEach((g) => {
      const guideStem = g.id.split('/')[1];
      urls.push({
        loc: `${SITE.url}/books/${book.slug}/${guideStem}`,
        changefreq: 'monthly',
        priority: '0.7',
      });
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`.trim();

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
