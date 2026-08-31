// Anchor helpers shared by the tree (badge) and its regression test.
// E-Bar form text carries real <a> tags inside CDATA; the tree renders labels
// as plain text, so it needs to detect links rather than silently strip them.

const ANCHOR_RE = /<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi;

export const extractHrefs = (html: string): string[] => {
  if (!html) return [];
  const hrefs: string[] = [];
  for (const m of html.matchAll(ANCHOR_RE)) hrefs.push(m[1]);
  return hrefs;
};

export const hasLinks = (html: string): boolean => extractHrefs(html).length > 0;
