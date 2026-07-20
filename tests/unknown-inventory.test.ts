import { test, expect } from 'vitest';
import { parseAnyXML } from '@/lib/xmlParser';
import { walkNodes } from '@/lib/validation';
import { listCorpusFiles, readCorpusFile, corpusAvailable } from './helpers/corpus';
import type { FormNode, FormUnknown } from '@/types/form';

// Guard against modeled elements silently falling into the unknown-preservation
// net (e.g. a missing parseSingleChild case). Across the whole corpus, the only
// legitimate unknowns are TEXT_BEARING elements with real child elements
// (as of 2026-07: 5 descriptions wrapping simpletext/question soup).
const LEGIT_UNKNOWN_TAGS = new Set(['description', 'warning', 'note', 'simpletext', 'option', 'answer']);
const MAX_EXPECTED_UNKNOWNS = 10;

test.skipIf(!corpusAvailable())('only mixed-content text-bearing elements are preserved as unknown', () => {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const f of listCorpusFiles()) {
    const form = parseAnyXML(readCorpusFile(f));
    if (!form) continue;
    walkNodes(form as FormNode, (n) => {
      if (n.nodeType === 'unknown') {
        const u = n as FormUnknown;
        counts[u.tagName] = (counts[u.tagName] || 0) + 1;
        total++;
      }
    });
  }

  const illegitimate = Object.keys(counts).filter(tag => !LEGIT_UNKNOWN_TAGS.has(tag));
  expect(illegitimate, `unexpected unknown tags: ${JSON.stringify(counts)}`).toHaveLength(0);
  expect(total, `unknown count grew unexpectedly: ${JSON.stringify(counts)}`).toBeLessThanOrEqual(MAX_EXPECTED_UNKNOWNS);
});
