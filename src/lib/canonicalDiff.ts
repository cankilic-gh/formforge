import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Canonical XML comparison for E-Bar questionnaire forms.
// Two documents are considered equivalent when the E-Bar engine
// (ilg.ebar.forms.NodeManager + ilg.common.forms models) would see the same thing.

type OrderedNode = { ':@'?: Record<string, unknown>; [key: string]: unknown };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  commentPropName: '#comment',
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: true,
});

const innerBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  commentPropName: '#comment',
  format: false,
  suppressEmptyNode: false,
  preserveOrder: true,
});

// Elements whose entire inner content the E-Bar engine reads as text
// (getTextContent / CDATA extraction) rather than as child model nodes
const TEXT_BEARING = new Set([
  'description', 'note', 'warning', 'simpletext', 'option', 'answer',
  'previousanswer', 'amendreason', 'validationmessage', 'required-doc',
]);

// Attribute defaults per the E-Bar model classes: absent attr ≡ this value
const ATTR_DEFAULTS: Record<string, Record<string, string>> = {
  question: { required: 'false', format: '', triggervalue: '', comment: '', option: '' },
  entity: { order: '0', nextorder: '1', showinbaradmin: 'true', grouptype: '' },
  note: { ischeckitem: 'false', prefix: '' },
  description: { prefix: '' },
  warning: { preventsubmit: 'false' },
  'required-doc': { preventsubmit: 'false' },
  includeform: { multipleinclude: 'false', required: 'true' },
  section: { print: 'true' },
  subsection: { print: 'true' },
  conditional: { condition: 'true' },
  condition: { equals: 'true' },
};

// Attributes E-Bar ignores entirely (safe to differ)
const IGNORED_ATTRS: Record<string, Set<string>> = {
  questionnaire: new Set(['order']),
};

interface CanonEl {
  tag: string;
  attrs: Record<string, string>;
  text?: string;
  children?: CanonEl[];
}

const getTag = (node: OrderedNode): string | null => {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text' && key !== '#cdata' && key !== '#comment') return key;
  }
  return null;
};

const normText = (s: string): string => s.replace(/\s+/g, ' ').trim();

// Serialize inner content: CDATA -> raw text, elements -> markup, then normalize
const innerText = (children: OrderedNode[]): string => {
  if (!children || !Array.isArray(children)) return '';
  let out = '';
  for (const child of children) {
    if ('#cdata' in child) {
      const c = child['#cdata'];
      out += Array.isArray(c)
        ? c.map(n => String((n as OrderedNode)['#text'] ?? '')).join('')
        : String(c);
    } else if ('#text' in child) {
      out += String(child['#text']);
    } else if ('#comment' in child) {
      // comments do not affect rendering
    } else {
      out += innerBuilder.build([child]);
    }
  }
  return normText(out);
};

const canonAttrs = (tag: string, node: OrderedNode): Record<string, string> => {
  const attrs = node[':@'] || {};
  const result: Record<string, string> = { ...(ATTR_DEFAULTS[tag] || {}) };
  const ignored = IGNORED_ATTRS[tag];
  for (const [key, value] of Object.entries(attrs)) {
    if (!key.startsWith('@_')) continue;
    const name = key.slice(2);
    if (ignored?.has(name)) continue;
    let v = String(value);
    // absent ≡ '' ≡ default for defaulted attrs
    if (v === '' && (ATTR_DEFAULTS[tag] || {})[name] !== undefined) {
      v = ATTR_DEFAULTS[tag][name];
    }
    result[name] = v;
  }
  return result;
};

const canonEl = (node: OrderedNode): CanonEl | null => {
  const tag = getTag(node);
  if (!tag) return null;
  const attrs = canonAttrs(tag, node);
  const children = (node[tag] as OrderedNode[]) || [];

  if (TEXT_BEARING.has(tag)) {
    return { tag, attrs, text: innerText(children) };
  }

  const canonChildren: CanonEl[] = [];
  for (const child of children) {
    const c = canonEl(child);
    if (c) canonChildren.push(c);
  }
  return { tag, attrs, children: canonChildren };
};

export const canonicalize = (xml: string): CanonEl | null => {
  const parsed = parser.parse(xml) as OrderedNode[];
  for (const node of parsed) {
    const tag = getTag(node);
    if (tag && tag !== '?xml') {
      return canonEl(node);
    }
  }
  return null;
};

export interface Diff {
  path: string;
  kind: string;
  detail: string;
}

const diffEl = (a: CanonEl, b: CanonEl, path: string, diffs: Diff[]): void => {
  if (a.tag !== b.tag) {
    diffs.push({ path, kind: 'tag', detail: `${a.tag} -> ${b.tag}` });
    return;
  }
  const p = `${path}/${a.tag}${a.attrs.id ? `[${a.attrs.id}]` : ''}`;

  const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  for (const key of keys) {
    if ((a.attrs[key] ?? '<absent>') !== (b.attrs[key] ?? '<absent>')) {
      diffs.push({
        path: p, kind: 'attr',
        detail: `@${key}: ${JSON.stringify(a.attrs[key] ?? null)} -> ${JSON.stringify(b.attrs[key] ?? null)}`,
      });
    }
  }

  if ((a.text ?? '') !== (b.text ?? '')) {
    diffs.push({
      path: p, kind: 'text',
      detail: `${JSON.stringify((a.text ?? '').slice(0, 120))} -> ${JSON.stringify((b.text ?? '').slice(0, 120))}`,
    });
  }

  const ac = a.children || [];
  const bc = b.children || [];
  if (ac.length !== bc.length) {
    const aTags = ac.map(c => c.tag).join(',');
    const bTags = bc.map(c => c.tag).join(',');
    diffs.push({ path: p, kind: 'children', detail: `${ac.length} [${aTags}] -> ${bc.length} [${bTags}]` });
    return;
  }
  for (let i = 0; i < ac.length; i++) {
    diffEl(ac[i], bc[i], p, diffs);
  }
};

export const diffXML = (originalXml: string, rebuiltXml: string): Diff[] => {
  const a = canonicalize(originalXml);
  const b = canonicalize(rebuiltXml);
  if (!a || !b) {
    return [{ path: '/', kind: 'parse', detail: `original=${!!a} rebuilt=${!!b}` }];
  }
  const diffs: Diff[] = [];
  diffEl(a, b, '', diffs);
  return diffs;
};
