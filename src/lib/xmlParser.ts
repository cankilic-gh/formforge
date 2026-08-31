import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  SourceFormat,
  TextLayout,
  FormQuestionnaire,
  FormSubform,
  FormSection,
  FormSubSection,
  FormQuestion,
  FormEntity,
  FormConditionSet,
  FormConditionLogic,
  FormCondition,
  FormConditional,
  FormDescription,
  FormWarning,
  FormNote,
  FormOption,
  FormReference,
  FormIncludeForm,
  FormRequiredDocument,
  FormSimpleText,
  FormValidator,
  FormAnswer,
  FormUnknown,
  FormNode,
  FormRoot,
  QuestionType,
  ConditionOperator,
} from '@/types/form';

// Parser options with preserveOrder to maintain element sequence.
// trimValues MUST stay false: descriptions can contain raw inline HTML
// ("Hello <strong>world</strong>") where inter-element whitespace is meaningful.
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: true,
};

// Builder options with preserveOrder. `indentBy` is FormForge's own default
// (4 spaces) — used for freshly-created forms and as the fallback whenever a
// parsed form carries no `_sourceFormat` (see detectSourceFormat below).
// `processEntities: false` hands escaping to us. fast-xml-parser's own escaper
// is not source-aware: it rewrites every literal apostrophe to "&apos;" and
// re-escapes the "&" of character references the parser never decoded, turning
// title="bullet &#149;" into title="bullet &amp;#149;". Both are byte drift on
// files nobody edited, and the second one changes what E-Bar renders. See
// escapeAttrValue / attrSpelling.
const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  format: true,
  indentBy: '    ',
  suppressEmptyNode: false,
  preserveOrder: true,
  processEntities: false,
};

// The five entity references fast-xml-parser decodes on the way in (numeric and
// HTML character references such as &#149; or &nbsp; are deliberately left
// alone by it, and must therefore be left alone by us too).
const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// Exactly the inverse of what the parser did — one pass, so "&amp;lt;" decodes
// to "&lt;" and not to "<".
const decodeXmlEntities = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => XML_ENTITIES[name]);

// True when the string at `index` already begins a well-formed entity or
// character reference, which must be passed through rather than re-escaped.
const ENTITY_REFERENCE_AT = /^&(?:#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/;

// Escapes "&" only where it is not already introducing a reference. This is what
// keeps hand-authored payloads like "&#8226;" or "&nbsp;" intact while still
// escaping a bare ampersand the user just typed.
const escapeAmpersands = (value: string): string =>
  value.replace(/&/g, (match, index: number) =>
    ENTITY_REFERENCE_AT.test(value.slice(index)) ? match : '&amp;');

// Attribute values are delimited with double quotes, so "<" and '"' must be
// escaped and "'" and ">" must not — the corpus overwhelmingly writes literal
// apostrophes, and a source that spelled one "&apos;" is restored verbatim from
// _rawAttrs instead of being guessed at here.
const escapeAttrValue = (value: string): string =>
  escapeAmpersands(value).replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Bare (non-CDATA) text content. ">" is escaped here because a literal source
// ">" round-trips through _rawText, and escaping is the safer default for text
// the user just typed.
const escapeTextValue = (value: string): string =>
  escapeAmpersands(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Picks an attribute's output spelling: the source's own bytes when the model
// value is unchanged, a freshly-escaped value when the user actually edited it.
const attrSpelling = (
  rawAttrs: Record<string, string> | undefined,
  name: string,
  value: string
): string => {
  const raw = rawAttrs?.[name];
  if (raw !== undefined && decodeXmlEntities(raw) === value) return raw;
  return escapeAttrValue(value);
};

// Detects the line-ending and per-level indent unit of a source XML file so
// buildXML/buildSubformXML can reproduce them. Without this, fast-xml-parser
// always emits LF + 4-space indent regardless of the source — and the real
// E-Bar corpus is ~97% CRLF (many also tab-indented), so every round-trip of
// an untouched file would otherwise turn every single line into a git diff
// even when nothing semantic changed.
const detectSourceFormat = (xml: string): SourceFormat => {
  const lineEnding: SourceFormat['lineEnding'] = xml.includes('\r\n') ? '\r\n' : '\n';
  // First indented element line in document order is always a depth-1 child
  // (its ancestors, if any, appear earlier in the text) — its leading
  // whitespace run is exactly one indent level for consistently-formatted XML.
  const match = xml.match(/\r?\n([ \t]+)</);
  const indent = match ? match[1] : '    ';
  const encodingMatch = xml.match(/<\?xml[^>]*\bencoding="([^"]+)"/i);
  const encoding = encodingMatch ? encodingMatch[1] : 'UTF-8';
  const trailingNewline = xml.endsWith('\n');
  // Majority vote across the whole file, used ONLY as the house style for nodes
  // the user creates fresh in the editor. Every node parsed from this file
  // carries its own `_textLayout` and ignores these — see detectTextLayout.
  const inlineCount = (xml.match(/\]\]>[ \t]*<\//g) || []).length;
  const multilineCount = (xml.match(/\]\]>[ \t]*\r?\n[ \t]*<\//g) || []).length;
  const cdataInlineClosing = inlineCount >= multilineCount;
  const openGluedCount = (xml.match(/>[ \t]*<!\[CDATA\[/g) || []).length;
  const openOwnLineCount = (xml.match(/>[ \t]*\r?\n[ \t]*<!\[CDATA\[/g) || []).length;
  const cdataOwnLine = openOwnLineCount > openGluedCount;
  return { lineEnding, indent, encoding, trailingNewline, cdataInlineClosing, cdataOwnLine };
};

// Reapplies a detected line ending to freshly-built XML. Only bare `\n` (not
// already part of a `\r\n` pair) is converted — CDATA text content copied
// verbatim from the source may already contain literal `\r\n` sequences, and
// converting those too would double up the `\r`.
const applySourceLineEnding = (xml: string, sourceFormat?: SourceFormat): string => {
  if (!sourceFormat || sourceFormat.lineEnding === '\n') return xml;
  return xml.replace(/(?<!\r)\n/g, '\r\n');
};

// Generate unique ID (fallback)
let idCounter = Date.now();
const generateId = (): string => {
  idCounter++;
  return `node_${idCounter}`;
};

// Type for preserveOrder format node
type OrderedNode = {
  ':@'?: Record<string, unknown>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Raw (undecoded) companion tree
//
// The model wants decoded values — the editor should show "Attorney's", not
// "Attorney&apos;s". The file wants its own bytes back. Those are different
// strings, and no amount of re-escaping can recover which spelling the source
// used, because both decode to the same thing.
//
// So the document is parsed a second time with entity decoding switched off.
// Both parses see the same bytes with the same options, so the two trees have
// identical shape and can be walked in lockstep; this map pairs them up. Only
// the differences are then kept on the model (see rawAttrsOf / rawTextOf), so
// the overwhelmingly common case — a value with no entities at all — costs
// nothing.
// ---------------------------------------------------------------------------
const rawNodeIndex = new WeakMap<OrderedNode, OrderedNode>();

const linkRawNodes = (decoded: OrderedNode[], raw: OrderedNode[]): void => {
  // A shape mismatch should be impossible; if it ever happens, stop linking
  // that branch and fall back to escaping, rather than pairing wrong nodes.
  if (!Array.isArray(decoded) || !Array.isArray(raw) || decoded.length !== raw.length) return;
  for (let i = 0; i < decoded.length; i++) {
    const tag = getTagName(decoded[i]);
    if (!tag || tag !== getTagName(raw[i])) continue;
    rawNodeIndex.set(decoded[i], raw[i]);
    linkRawNodes(decoded[i][tag] as OrderedNode[], raw[i][tag] as OrderedNode[]);
  }
};

// Parses the raw companion tree and links it to the decoded one. Skipped
// entirely when the document contains no "&", since without one no value can
// possibly have an ambiguous spelling.
const indexRawSpellings = (xmlString: string, decoded: OrderedNode[]): void => {
  if (!xmlString.includes('&')) return;
  try {
    const raw = new XMLParser({ ...parserOptions, processEntities: false }).parse(xmlString) as OrderedNode[];
    linkRawNodes(decoded, raw);
  } catch {
    // Best-effort: without the raw tree we simply fall back to escaping.
  }
};

// The source spelling of every attribute the parser decoded, keyed by attribute
// name — restricted to the ones that actually differ.
const rawAttrsOf = (node: OrderedNode): Record<string, string> | undefined => {
  const raw = rawNodeIndex.get(node);
  if (!raw) return undefined;
  const decodedAttrs = getAttrs(node);
  const rawAttrs = getAttrs(raw);
  let result: Record<string, string> | undefined;
  for (const key of Object.keys(rawAttrs)) {
    if (!key.startsWith('@_')) continue;
    const rawValue = String(rawAttrs[key] ?? '');
    if (rawValue === String(decodedAttrs[key] ?? '')) continue;
    (result ||= {})[key.slice(2)] = rawValue;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Empty-tag spelling
//
// "<validator id='1'/>" and "<validator id='1'></validator>" parse to exactly
// the same thing, and fast-xml-parser's builder can only be told to self-close
// every empty element or none of them. The corpus mixes both spellings, so the
// choice has to be recorded per element, from the source.
//
// The same question comes up for whitespace inside the tag: 22 corpus files
// write `<subform ... version="1.0" >` with a space before the ">". Both are
// the same fact — how did the source terminate this start tag — so one scan
// records both.
//
// This walks the document once, skipping anything that is not a start tag, and
// returns one entry per element in document order: the exact terminating bytes
// ("/>", " />", " >") when they are anything other than a bare ">", undefined
// otherwise. That order is the tree's pre-order, so the two can be zipped.
// ---------------------------------------------------------------------------
const scanStartTagClosings = (xml: string): (string | undefined)[] => {
  const closings: (string | undefined)[] = [];
  const end = xml.length;
  let i = 0;
  while (i < end) {
    const open = xml.indexOf('<', i);
    if (open === -1) break;
    const skipTo = (marker: string, offset: number): number => {
      const at = xml.indexOf(marker, open);
      return at === -1 ? end : at + offset;
    };
    if (xml.startsWith('<!--', open)) { i = skipTo('-->', 3); continue; }
    if (xml.startsWith('<![CDATA[', open)) { i = skipTo(']]>', 3); continue; }
    if (xml.startsWith('<?', open)) { i = skipTo('?>', 2); continue; }
    if (xml.startsWith('<!', open) || xml.startsWith('</', open)) { i = skipTo('>', 1); continue; }

    // A start tag. Find its '>', ignoring any that sit inside a quoted value.
    let cursor = open + 1;
    let quote = '';
    while (cursor < end) {
      const ch = xml[cursor];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      cursor++;
    }
    if (cursor >= end) break;

    let from = xml[cursor - 1] === '/' ? cursor - 1 : cursor;
    while (from > open + 1 && (xml[from - 1] === ' ' || xml[from - 1] === '\t')) from--;
    const closing = xml.slice(from, cursor + 1);
    closings.push(closing === '>' ? undefined : closing);
    i = cursor + 1;
  }
  return closings;
};

// Pre-order walk over element nodes only — the same order scanEmptyTagClosings
// produces. fast-xml-parser reports the XML declaration as a "?xml" node and
// would otherwise put the two sequences one apart for every single file.
const isElementTag = (tag: string | null): tag is string =>
  tag !== null && !tag.startsWith('?') && !tag.startsWith('!');

const forEachElement = (nodes: OrderedNode[], visit: (node: OrderedNode) => void): void => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    const tag = getTagName(node);
    if (!isElementTag(tag)) continue;
    visit(node);
    forEachElement(node[tag] as OrderedNode[], visit);
  }
};

const startTagCloseIndex = new WeakMap<OrderedNode, string>();

const indexStartTagClosings = (xmlString: string, parsed: OrderedNode[]): void => {
  const closings = scanStartTagClosings(xmlString);
  const elements: OrderedNode[] = [];
  forEachElement(parsed, node => elements.push(node));
  // A mismatch means the scan and the parse disagree about what an element is;
  // rather than pair the wrong nodes, record nothing and keep today's spelling.
  if (elements.length !== closings.length) return;
  elements.forEach((node, index) => {
    const closing = closings[index];
    if (closing) startTagCloseIndex.set(node, closing);
  });
};

// The source spelling of a bare text payload, when it differs from the decoded
// one. CDATA is never entity-decoded, so this only ever fires for bare text.
const rawTextOf = (node: OrderedNode, decodedText: string): string | undefined => {
  // Fall back to the node itself when there is no raw companion (a document
  // with no "&" in it): the whitespace still has to be preserved even when
  // there are no entities to disambiguate.
  const source = rawNodeIndex.get(node) ?? node;
  const tag = getTagName(source);
  if (!isElementTag(tag)) return undefined;
  const rawText = collectPayload(source[tag] as OrderedNode[], false);
  return rawText === decodedText ? undefined : rawText;
};

// parseInt that does not fall into the ||-falsy trap (nextorder="0" must stay 0)
const parseIntOr = (value: unknown, fallback: number): number => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isNaN(n) ? fallback : n;
};

// Get attributes from ordered node
const getAttrs = (node: OrderedNode): Record<string, unknown> => {
  return node[':@'] || {};
};

// Recursively extract text from any value
const extractText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Check for text content keys
    if ('#cdata' in obj) return extractText(obj['#cdata']);
    if ('#text' in obj) return extractText(obj['#text']);
    // Try to find any string value
    for (const key of Object.keys(obj)) {
      if (!key.startsWith('@_') && !key.startsWith(':')) {
        const result = extractText(obj[key]);
        if (result) return result;
      }
    }
  }
  return '';
};

// Builder used to reconstruct raw inline XML (no re-formatting).
// `processEntities: false` for the verbatim path: the subtree it serialises was
// parsed WITHOUT entity decoding, so its strings are already source bytes and
// re-escaping them would double up every "&".
const innerXmlBuilder = (processEntities = true) => new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  format: false,
  suppressEmptyNode: false,
  preserveOrder: true,
  processEntities,
});

// True when the ordered children contain real element nodes (mixed content)
const hasElementChildren = (children: OrderedNode[]): boolean => {
  if (!children || !Array.isArray(children)) return false;
  return children.some(child => getTagName(child) !== null);
};

// Get text content from ordered node array.
// Pure text/CDATA content is concatenated; mixed content (raw inline HTML like
// "Hello <strong>world</strong>") is reconstructed verbatim so no markup is lost.
// `trimBareText` is what separates the model's view from the file's view: the
// editor wants "Full Name", the file may have written "Full Name " with a
// trailing space that has to come back. Both callers share the loop so the two
// can never drift apart.
const collectPayload = (children: OrderedNode[], trimBareText: boolean): string => {
  if (!children || !Array.isArray(children)) return '';

  if (hasElementChildren(children)) {
    return innerXmlBuilder().build(children).trim();
  }

  const texts: string[] = [];
  let hasCdata = false;
  for (const child of children) {
    if ('#cdata' in child) {
      hasCdata = true;
      texts.push(extractText(child['#cdata']));
    } else if ('#text' in child) {
      const t = extractText(child['#text']);
      // skip pure indentation around CDATA blocks
      if (t.trim() !== '') texts.push(t);
    }
  }
  const joined = texts.join('');
  return hasCdata || !trimBareText ? joined : joined.trim();
};

const getTextFromOrdered = (children: OrderedNode[]): string => collectPayload(children, true);

// Capture how THIS element laid its text payload out in the source, so the
// build can reproduce it exactly. Node-level on purpose: the corpus mixes
// conventions inside single files, so a per-file majority vote always rewrites
// the minority (see TextLayout in types/form.ts).
const isIndentationText = (value: unknown): boolean => {
  const t = extractText(value);
  return t.trim() === '' && /\n/.test(t);
};

const detectTextLayout = (children: OrderedNode[]): TextLayout | undefined => {
  if (!children || !Array.isArray(children) || children.length === 0) return undefined;
  const first = children[0];
  const last = children[children.length - 1];
  return {
    cdata: children.some(child => '#cdata' in child),
    openOwnLine: '#text' in first && isIndentationText(first['#text']),
    // guard on length: a lone whitespace child is the opening side, not the closing one
    closeOwnLine: children.length > 1 && '#text' in last && isIndentationText(last['#text']),
  };
};

// Extract original attributes
const extractOriginalAttrs = (attrs: Record<string, unknown>): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.keys(attrs).forEach(key => {
    if (key.startsWith('@_')) {
      const attrName = key.replace('@_', '');
      const value = attrs[key];
      // empty strings are kept: the real corpus is full of attrs like ncbe_name=""
      if (value !== undefined && value !== null) {
        if (value === true) {
          result[attrName] = 'true';
        } else if (value === false) {
          result[attrName] = 'false';
        } else {
          result[attrName] = String(value);
        }
      }
    }
  });
  return result;
};

// Get the tag name from an ordered node
const getTagName = (node: OrderedNode): string | null => {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text' && key !== '#cdata') {
      return key;
    }
  }
  return null;
};

// Parse Description
const parseDescription = (attrs: Record<string, unknown>, children: OrderedNode[]): FormDescription => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'description',
  prefix: String(attrs['@_prefix'] || ''),
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse Warning
const parseWarning = (attrs: Record<string, unknown>, children: OrderedNode[]): FormWarning => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'warning',
  text: getTextFromOrdered(children),
  preventSubmit: attrs['@_preventsubmit'] === 'true',
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse Note
const parseNote = (attrs: Record<string, unknown>, children: OrderedNode[]): FormNote => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'note',
  text: getTextFromOrdered(children),
  isCheckItem: attrs['@_ischeckitem'] === 'true',
  prefix: String(attrs['@_prefix'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse SimpleText - bare HTML fragment, E-Bar reads only id + text content
const parseSimpleText = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSimpleText => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'simpletext',
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse Validator - standalone validator element
const parseValidator = (attrs: Record<string, unknown>): FormValidator => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'validator',
  validatorClass: String(attrs['@_validatorclass'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Answer - applicant answer (present in saved user files)
const parseAnswer = (attrs: Record<string, unknown>, children: OrderedNode[]): FormAnswer => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'answer',
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse Unknown - preserve the raw subtree verbatim so nothing is silently lost
// `raw` holds the UNDECODED subtree when one is available: it is re-emitted
// verbatim, so it must carry source bytes, not decoded ones. Re-escaping a
// decoded subtree would turn every "&#149;" back into "&amp;#149;".
const parseUnknown = (tagName: string, attrs: Record<string, unknown>, child: OrderedNode): FormUnknown => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'unknown',
  tagName,
  raw: structuredClone(rawNodeIndex.get(child) ?? child),
  rawIsVerbatim: rawNodeIndex.has(child),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Option
const parseOption = (attrs: Record<string, unknown>, children: OrderedNode[]): FormOption => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'option',
  value: String(attrs['@_value'] || ''),
  text: getTextFromOrdered(children),
  _originalAttrs: extractOriginalAttrs(attrs),
  _textLayout: detectTextLayout(children),
});

// Parse Reference (no default for field - E-Bar reads it verbatim)
const parseReference = (attrs: Record<string, unknown>): FormReference => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'reference',
  table: String(attrs['@_table'] || ''),
  field: String(attrs['@_field'] ?? '') as FormReference['field'],
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Question - preserves child order
const parseQuestion = (attrs: Record<string, unknown>, children: OrderedNode[]): FormQuestion => {
  const questionChildren: FormQuestion['children'] = [];

  // Process children in order
  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (!tagName) continue;
    if (tagName === 'reference') {
      questionChildren.push(attachRawSpellings(parseReference(childAttrs), child) as FormReference);
    } else {
      const parsed = parseSingleChild(child);
      if (parsed) questionChildren.push(parsed as FormQuestion['children'][number]);
    }
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'question',
    type: (attrs['@_type'] || 'char') as QuestionType,
    format: String(attrs['@_format'] || ''),
    option: String(attrs['@_option'] || ''),
    required: attrs['@_required'] === 'true',
    triggerValue: String(attrs['@_triggervalue'] || ''),
    comment: String(attrs['@_comment'] || ''),
    maxlength: parseInt(String(attrs['@_maxlength'] || '0'), 10) || 0,
    refname: String(attrs['@_refname'] || ''),
    appType: String(attrs['@_app_type'] || ''),
    appTypeTrigger: String(attrs['@_app_type_trigger'] || ''),
    isAmended: attrs['@_isamended'] === 'true',
    validatorClass: String(attrs['@_validatorclass'] || ''),
    validationMessage: String(attrs['@_validationmessage'] || ''),
    ncbeName: String(attrs['@_ncbe_name'] || ''),
    ncbeCurrently: attrs['@_ncbe_currently'] === 'true',
    ilgName: String(attrs['@_ilg_name'] || ''),
    children: questionChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse IncludeForm (children carry grafted subform instances in saved user files)
// NOTE: E-Bar's IncludeForm defaults required to TRUE - only required="false" disables it
const parseIncludeForm = (attrs: Record<string, unknown>, children: OrderedNode[] = []): FormIncludeForm => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'includeform',
  formName: String(attrs['@_formname'] || ''),
  title: String(attrs['@_title'] || ''),
  type: String(attrs['@_type'] || 'online'),
  multipleInclude: attrs['@_multipleinclude'] === 'true',
  required: attrs['@_required'] !== 'false',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse RequiredDocument
const parseRequiredDoc = (attrs: Record<string, unknown>): FormRequiredDocument => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'required-doc',
  title: String(attrs['@_title'] || ''),
  preventSubmit: attrs['@_preventsubmit'] === 'true',
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Condition
const parseCondition = (attrs: Record<string, unknown>): FormCondition => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'condition',
  equals: String(attrs['@_equals'] || 'true'),
  value: String(attrs['@_value'] || ''),
  questionId: String(attrs['@_questionid'] || ''),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Forward declarations
let parseChildren: (children: OrderedNode[]) => FormNode[];
let parseConditional: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditional;
let parseConditionSet: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditionSet;
let parseConditionLogic: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormConditionLogic;
let parseEntity: (attrs: Record<string, unknown>, children: OrderedNode[]) => FormEntity;

// Parse Conditional
parseConditional = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditional => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'conditional',
  condition: attrs['@_condition'] ? String(attrs['@_condition']) : 'true',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse ConditionSet - preserves child order
parseConditionSet = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditionSet => {
  const csChildren: FormConditionSet['children'] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (!tagName) continue;
    const parsed = parseSingleChild(child);
    if (parsed) csChildren.push(parsed);
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'conditionset',
    operator: (attrs['@_operator'] || 'and') as ConditionOperator,
    children: csChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse ConditionLogic
parseConditionLogic = (attrs: Record<string, unknown>, children: OrderedNode[]): FormConditionLogic => {
  const conditions: FormCondition[] = [];
  const clChildren: FormNode[] = [];

  for (const child of children) {
    const childAttrs = getAttrs(child);
    const tagName = getTagName(child);

    if (tagName === 'condition') {
      conditions.push(attachRawSpellings(parseCondition(childAttrs), child) as FormCondition);
    } else if (tagName) {
      // Parse other children using parseChildren logic
      const parsed = parseSingleChild(child);
      if (parsed) clChildren.push(parsed);
    }
  }

  return {
    id: String(attrs['@_id'] || generateId()),
    nodeType: 'conditionlogic',
    operator: (attrs['@_operator'] || 'or') as ConditionOperator,
    conditions,
    children: clChildren,
    _originalAttrs: extractOriginalAttrs(attrs),
  };
};

// Parse Entity
parseEntity = (attrs: Record<string, unknown>, children: OrderedNode[]): FormEntity => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'entity',
  title: String(attrs['@_title'] || ''),
  type: (attrs['@_type'] || 'single') as 'single' | 'addmore',
  min: parseIntOr(attrs['@_min'], 0),
  max: parseIntOr(attrs['@_max'], 0),
  entityOrder: parseIntOr(attrs['@_order'], 0),
  nextOrder: parseIntOr(attrs['@_nextorder'], 1),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  isAmended: attrs['@_isamended'] === 'true',
  groupType: String(attrs['@_grouptype'] || ''),
  ncbeName: String(attrs['@_ncbe_name'] || ''),
  ncbeValue: String(attrs['@_ncbe_value'] || ''),
  ilgName: String(attrs['@_ilg_name'] || ''),
  ilgValue: String(attrs['@_ilg_value'] || ''),
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse a single child node
// Records the source spellings of a freshly-parsed node, so the build can put
// the file's own bytes back for anything the user did not touch.
const attachRawSpellings = (node: FormNode | null, source: OrderedNode): FormNode | null => {
  if (!node) return node;
  const startTagClose = startTagCloseIndex.get(source);
  if (startTagClose) node._startTagClose = startTagClose;
  if (node.nodeType === 'unknown') return node;
  const rawAttrs = rawAttrsOf(source);
  if (rawAttrs) node._rawAttrs = rawAttrs;
  if ('text' in node && typeof node.text === 'string') {
    const rawText = rawTextOf(source, node.text);
    if (rawText !== undefined) node._rawText = rawText;
  }
  return node;
};

const parseSingleChild = (child: OrderedNode): FormNode | null =>
  attachRawSpellings(parseSingleChildInner(child), child);

const parseSingleChildInner = (child: OrderedNode): FormNode | null => {
  const childAttrs = getAttrs(child);
  const tagName = getTagName(child);

  if (!tagName) return null;

  const childContent = child[tagName] as OrderedNode[];

  // Text-bearing elements that contain REAL child elements (e.g. a description
  // wrapping a simpletext with its own CDATA) cannot be flattened to text without
  // corrupting nested CDATA - preserve the whole subtree verbatim instead.
  const TEXT_BEARING = ['description', 'warning', 'note', 'simpletext', 'option', 'answer'];
  if (TEXT_BEARING.includes(tagName) && hasElementChildren(childContent)) {
    return parseUnknown(tagName, childAttrs, child);
  }

  switch (tagName) {
    case 'section':
      return parseSection(childAttrs, childContent);
    case 'subsection':
      return parseSubSection(childAttrs, childContent);
    case 'question':
      return parseQuestion(childAttrs, childContent);
    case 'entity':
      return parseEntity(childAttrs, childContent);
    case 'conditionset':
      return parseConditionSet(childAttrs, childContent);
    case 'conditionlogic':
      return parseConditionLogic(childAttrs, childContent);
    case 'conditional':
      return parseConditional(childAttrs, childContent);
    case 'description':
      return parseDescription(childAttrs, childContent);
    case 'warning':
      return parseWarning(childAttrs, childContent);
    case 'note':
      return parseNote(childAttrs, childContent);
    case 'option':
      return parseOption(childAttrs, childContent);
    case 'reference':
      return parseReference(childAttrs);
    case 'simpletext':
      return parseSimpleText(childAttrs, childContent);
    case 'validator':
      return parseValidator(childAttrs);
    case 'answer':
      return parseAnswer(childAttrs, childContent);
    case 'includeform':
      return parseIncludeForm(childAttrs, childContent);
    case 'required-doc':
      return parseRequiredDoc(childAttrs);
    default:
      // Never silently drop: preserve the raw subtree and re-emit it verbatim
      return parseUnknown(tagName, childAttrs, child);
  }
};

// Parse children (generic) - preserves order
parseChildren = (children: OrderedNode[]): FormNode[] => {
  const result: FormNode[] = [];

  for (const child of children) {
    const parsed = parseSingleChild(child);
    if (parsed) result.push(parsed);
  }

  return result;
};

// Parse SubSection
const parseSubSection = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSubSection => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'subsection',
  title: String(attrs['@_title'] || ''),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  depends: attrs['@_depends'] === undefined ? undefined : String(attrs['@_depends']),
  condition: attrs['@_condition'] === undefined ? undefined : String(attrs['@_condition']),
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Parse Section - subsections plus anything else that legitimately sits at section level
const parseSection = (attrs: Record<string, unknown>, children: OrderedNode[]): FormSection => ({
  id: String(attrs['@_id'] || generateId()),
  nodeType: 'section',
  title: String(attrs['@_title'] || ''),
  showInBarAdmin: attrs['@_showinbaradmin'] === undefined ? undefined : attrs['@_showinbaradmin'] === 'true',
  children: parseChildren(children),
  _originalAttrs: extractOriginalAttrs(attrs),
});

// Generate a random 5-digit suffix
const generateSuffix = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};

// Parse Questionnaire
export const parseXML = (xmlString: string): FormQuestionnaire | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    // Find questionnaire element
    let questionnaireNode: OrderedNode | null = null;
    for (const node of result) {
      if ('questionnaire' in node) {
        questionnaireNode = node;
        break;
      }
    }

    if (!questionnaireNode) {
      console.error('No questionnaire element found');
      return null;
    }

    indexRawSpellings(xmlString, result);
    indexStartTagClosings(xmlString, result);

    const attrs = getAttrs(questionnaireNode);
    const children = questionnaireNode['questionnaire'] as OrderedNode[];

    const form: FormQuestionnaire = {
      id: String(attrs['@_id'] || generateId()),
      nodeType: 'questionnaire',
      title: String(attrs['@_title'] || 'Untitled Form'),
      suffix: String(attrs['@_suffix'] || ''),
      nextId: parseInt(String(attrs['@_nextid'] || '1'), 10) || 1,
      children: parseChildren(children),
      _originalAttrs: extractOriginalAttrs(attrs),
      _rawAttrs: rawAttrsOf(questionnaireNode),
      _startTagClose: startTagCloseIndex.get(questionnaireNode),
      _sourceFormat: detectSourceFormat(xmlString),
    };

    return form;
  } catch (error) {
    console.error('Failed to parse XML:', error);
    return null;
  }
};

// ============================================================================
// SHARED XML BUILDER HELPERS
// These helpers are used by both buildXML and buildSubformXML to avoid DRY
// ============================================================================

// Helper to create ordered node with attributes
// Every element in the output passes through here exactly once, which makes it
// the one place that has to decide how attribute values are spelled on disk.
// The builder itself is running with processEntities off, so whatever string
// lands in the map is what the file gets.
// Attribute name after fast-xml-parser strips the '@_' prefix: __ffclose.
// Must stay in step with DEFERRED_CONTENT_RE below.
const START_TAG_CLOSE_MARKER = '@___ffclose';

const createOrderedNode = (
  tagName: string,
  attrs: Record<string, unknown>,
  children: OrderedNode[] = [],
  rawAttrs?: Record<string, string>,
  startTagClose?: string
): OrderedNode => {
  const node: OrderedNode = {};
  const names = Object.keys(attrs);
  const spelled: Record<string, unknown> = {};
  for (const key of names) {
    spelled[key] = key.startsWith('@_')
      ? attrSpelling(rawAttrs, key.slice(2), String(attrs[key] ?? ''))
      : attrs[key];
  }
  // Marker attribute, always last, telling the splice to terminate this start
  // tag the way the source did. It carries the exact bytes ("/>", " />", " >")
  // and never reaches the file. A self-closing spelling is dropped once the
  // node has children, since it can no longer be written that way.
  if (startTagClose && !(children.length > 0 && startTagClose.endsWith('/>'))) {
    spelled[START_TAG_CLOSE_MARKER] = startTagClose;
  }
  if (Object.keys(spelled).length > 0) {
    node[':@'] = spelled;
  }
  node[tagName] = children;
  return node;
};

// Helper to merge original attributes with overrides
const mergeAttrs = (
  original: Record<string, string> | undefined,
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  // First copy original attributes
  if (original) {
    Object.entries(original).forEach(([key, value]) => {
      if (value === 'true') {
        result[`@_${key}`] = '__BOOL_TRUE__';
      } else if (value === 'false') {
        result[`@_${key}`] = '__BOOL_FALSE__';
      } else {
        result[`@_${key}`] = value;
      }
    });
  }

  // Then apply overrides
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result;
};

// Helper for boolean placeholders
const boolPlaceholder = (val: string | boolean | undefined): string => {
  if (val === true || val === 'true') return '__BOOL_TRUE__';
  if (val === false || val === 'false') return '__BOOL_FALSE__';
  return String(val || '');
};

// Optional string attr: emit when non-empty; when the user cleared a previously
// non-empty value, drop the attr so the stale original spelling (already copied
// in by mergeAttrs) doesn't resurface. Empty-string originals are kept verbatim.
const setOptionalAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: string | undefined
): void => {
  if (value) {
    attrs[`@_${name}`] = value;
  } else if (original?.[name]) {
    delete attrs[`@_${name}`];
  }
};

// Boolean attr: keep the original spelling when the value is unchanged
// (isamended="" stays ""), emit the corrected value otherwise
const setBoolAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: boolean
): void => {
  const orig = original?.[name];
  if (orig !== undefined) {
    if ((orig === 'true') === value) return;
    attrs[`@_${name}`] = value ? '__BOOL_TRUE__' : '__BOOL_FALSE__';
  } else if (value) {
    attrs[`@_${name}`] = '__BOOL_TRUE__';
  }
};

// Override a numeric attribute only when the value actually changed.
// Keeps original spellings like min="" (E-Bar treats it as 0) byte-identical,
// and — for a parsed node whose source simply never wrote the attribute — does
// not invent one just because the model field defaults to 0.
const setNumericAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: number
): void => {
  const orig = original?.[name];
  if (orig !== undefined) {
    if ((parseInt(orig, 10) || 0) === (value || 0)) return;
  } else if (original !== undefined && (value || 0) === 0) {
    return;
  }
  attrs[`@_${name}`] = String(value || 0);
};

// THE attribute-lifecycle rule, in one place.
//
// Every model field has a value it parses back to when its attribute is absent
// from the source (a question with no comment="" parses to comment: ''). Those
// three cases are all distinct and must stay distinct on the way out:
//
//   * node created fresh in the editor (no _originalAttrs at all) -> emit the
//     full canonical attribute set E-Bar expects
//   * attribute present in the source -> re-emit it, in its original position
//     (mergeAttrs already seeded it) with whatever value the model now holds
//   * attribute absent from the source -> emit ONLY if the user actually
//     changed the value away from what "absent" means
//
// Collapsing the last two is what made FormForge rewrite 255 <question> lines
// of the CO Character and Fitness questionnaire on every save: every question
// that had never carried comment="" acquired one.
const setDefaultedAttr = (
  attrs: Record<string, unknown>,
  original: Record<string, string> | undefined,
  name: string,
  value: string,
  absentValue: string
): void => {
  if (original === undefined || name in original || value !== absentValue) {
    attrs[`@_${name}`] = value;
  }
};

// ---------------------------------------------------------------------------
// Deferred text payloads
//
// A text-bearing leaf's payload is NOT handed to the XML builder. The builder
// would re-wrap and re-indent it, and every later post-processing pass would
// have to tiptoe around it. Instead the payload is parked here and a token is
// emitted in its place; the token is replaced with the real bytes at the very
// end of the build, after line-ending conversion. Two consequences that matter:
//
//   * the payload's own bytes are never touched by any pass, so text containing
//     CRLF, "]]>", or a literal "__BOOL_TRUE__" survives verbatim
//   * the surrounding whitespace is rebuilt from the node's own _textLayout,
//     which is what makes per-node CDATA layouts possible at all
// ---------------------------------------------------------------------------
type PendingText = { text: string; layout: TextLayout; rawText?: string };
let pendingTexts: PendingText[] = [];
const resetPendingTexts = (): void => { pendingTexts = []; };

// Layout for nodes created fresh in the editor: follow the open file's house
// style so a new description doesn't stand out from its neighbours.
const houseTextLayout = (sourceFormat?: SourceFormat): TextLayout => ({
  cdata: true,
  openOwnLine: sourceFormat?.cdataOwnLine ?? false,
  closeOwnLine: !(sourceFormat?.cdataInlineClosing ?? true),
});
let fallbackTextLayout: TextLayout = houseTextLayout();

const makeTextContent = (
  text: string | undefined | null,
  layout: TextLayout | undefined,
  rawText?: string
): OrderedNode[] => {
  const t = text || '';
  if (!t) return [];
  const token = `__FFTXT_${pendingTexts.length}__`;
  pendingTexts.push({ text: t, layout: layout ?? fallbackTextLayout, rawText });
  return [{ '#text': token }];
};

// Build Description node
const buildDescription = (desc: FormDescription): OrderedNode => {
  const attrs = mergeAttrs(desc._originalAttrs, { '@_id': desc.id });
  setDefaultedAttr(attrs, desc._originalAttrs, 'prefix', desc.prefix, '');
  return createOrderedNode('description', attrs, makeTextContent(desc.text, desc._textLayout, desc._rawText), desc._rawAttrs, desc._startTagClose);
};

// Build Warning node
const buildWarning = (warning: FormWarning): OrderedNode => {
  const attrs = mergeAttrs(warning._originalAttrs, {
    '@_id': warning.id,
  });
  if (warning.preventSubmit || warning._originalAttrs?.preventsubmit !== undefined) {
    attrs['@_preventsubmit'] = boolPlaceholder(warning.preventSubmit);
  }
  return createOrderedNode('warning', attrs, makeTextContent(warning.text, warning._textLayout, warning._rawText), warning._rawAttrs, warning._startTagClose);
};

// Build Note node
const buildNote = (note: FormNote): OrderedNode => {
  const attrs = mergeAttrs(note._originalAttrs, { '@_id': note.id });
  setDefaultedAttr(attrs, note._originalAttrs, 'ischeckitem', String(note.isCheckItem), 'false');
  if (note.prefix || note._originalAttrs?.prefix !== undefined) {
    attrs['@_prefix'] = note.prefix;
  }
  return createOrderedNode('note', attrs, makeTextContent(note.text, note._textLayout, note._rawText), note._rawAttrs, note._startTagClose);
};

// Build SimpleText node
const buildSimpleText = (st: FormSimpleText): OrderedNode => {
  const attrs = mergeAttrs(st._originalAttrs, {
    '@_id': st.id,
  });
  return createOrderedNode('simpletext', attrs, makeTextContent(st.text, st._textLayout, st._rawText), st._rawAttrs, st._startTagClose);
};

// Build Validator node
const buildValidator = (validator: FormValidator): OrderedNode => {
  const attrs = mergeAttrs(validator._originalAttrs, { '@_id': validator.id });
  setDefaultedAttr(attrs, validator._originalAttrs, 'validatorclass', validator.validatorClass, '');
  return createOrderedNode('validator', attrs, [], validator._rawAttrs, validator._startTagClose);
};

// Build Answer node
const buildAnswer = (answer: FormAnswer): OrderedNode => {
  const attrs = mergeAttrs(answer._originalAttrs, {
    '@_id': answer.id,
  });
  return createOrderedNode('answer', attrs, makeTextContent(answer.text, answer._textLayout, answer._rawText), answer._rawAttrs, answer._startTagClose);
};

// Build Unknown node - re-emit the preserved raw subtree verbatim.
// The pretty-printing builder would re-indent inside the subtree (corrupting
// mixed content), so we emit a placeholder token and splice the verbatim
// serialization into the final string in a post-processing pass.
let rawSubtrees: string[] = [];
const resetRawSubtrees = (): void => { rawSubtrees = []; };
// The placeholder is an empty ELEMENT rather than a text node on purpose. A
// text child makes fast-xml-parser treat the parent as text content and pull
// everything onto one line, which silently ate the newline and indentation
// around any preserved subtree that happened to be its parent's only child.
// An element placeholder gets laid out exactly like the element it stands in
// for, and the splice then swaps in the verbatim bytes.
const buildUnknown = (unknown: FormUnknown): OrderedNode | null => {
  if (!unknown.raw) return null;
  const verbatim = innerXmlBuilder(!unknown.rawIsVerbatim).build([structuredClone(unknown.raw)]);
  const token = `__FFRAW_${rawSubtrees.length}__`;
  rawSubtrees.push(verbatim);
  return { [token]: [] } as OrderedNode;
};
const spliceRawSubtrees = (xmlContent: string): string => {
  return xmlContent.replace(/__FFRAW_(\d+)__/g, (match, idx) => {
    const raw = rawSubtrees[parseInt(idx, 10)];
    return raw !== undefined ? raw : match;
  });
};

// Build Option node
const buildOption = (option: FormOption): OrderedNode => {
  const attrs = mergeAttrs(option._originalAttrs, { '@_id': option.id });
  setDefaultedAttr(attrs, option._originalAttrs, 'value', option.value, '');
  return createOrderedNode('option', attrs, makeTextContent(option.text, option._textLayout, option._rawText), option._rawAttrs, option._startTagClose);
};

// Build Reference node
const buildReference = (ref: FormReference): OrderedNode => {
  const attrs = mergeAttrs(ref._originalAttrs, { '@_id': ref.id });
  setDefaultedAttr(attrs, ref._originalAttrs, 'table', ref.table, '');
  setDefaultedAttr(attrs, ref._originalAttrs, 'field', ref.field, '');
  return createOrderedNode('reference', attrs, [], ref._rawAttrs, ref._startTagClose);
};

// Build Question node
const buildQuestion = (question: FormQuestion): OrderedNode => {
  // keep original spellings: type="" is a legacy alias of char,
  // required="" is E-Bar's spelling of false
  const typeValue =
    question._originalAttrs?.type === '' && question.type === 'char' ? '' : question.type;
  const requiredValue =
    question._originalAttrs?.required === '' && question.required === false
      ? ''
      : boolPlaceholder(question.required);
  const attrs = mergeAttrs(question._originalAttrs, { '@_id': question.id });
  // Order of these calls is the attribute order a BRAND NEW question gets;
  // a parsed question keeps whatever order the source used (mergeAttrs seeded
  // it) and only picks up an attr here if the source had it or the user
  // changed it away from its absent-value. parseQuestion's own defaults are
  // the absent-values: type "char", everything else empty/false.
  setDefaultedAttr(attrs, question._originalAttrs, 'type', typeValue, 'char');
  setDefaultedAttr(attrs, question._originalAttrs, 'format', question.format, '');
  setDefaultedAttr(attrs, question._originalAttrs, 'required', requiredValue, boolPlaceholder(false));
  setDefaultedAttr(attrs, question._originalAttrs, 'triggervalue', boolPlaceholder(question.triggerValue), '');
  setDefaultedAttr(attrs, question._originalAttrs, 'comment', question.comment || '', '');

  if (question.maxlength) {
    attrs['@_maxlength'] = String(question.maxlength);
  } else if (parseIntOr(question._originalAttrs?.maxlength, 0) !== 0) {
    delete attrs['@_maxlength'];
  }
  setOptionalAttr(attrs, question._originalAttrs, 'option', question.option);
  setOptionalAttr(attrs, question._originalAttrs, 'refname', question.refname);
  setOptionalAttr(attrs, question._originalAttrs, 'app_type', question.appType);
  setOptionalAttr(attrs, question._originalAttrs, 'app_type_trigger', question.appTypeTrigger);
  setBoolAttr(attrs, question._originalAttrs, 'isamended', question.isAmended);
  setOptionalAttr(attrs, question._originalAttrs, 'validatorclass', question.validatorClass);
  setOptionalAttr(attrs, question._originalAttrs, 'validationmessage', question.validationMessage);
  setOptionalAttr(attrs, question._originalAttrs, 'ncbe_name', question.ncbeName);
  setBoolAttr(attrs, question._originalAttrs, 'ncbe_currently', question.ncbeCurrently);
  setOptionalAttr(attrs, question._originalAttrs, 'ilg_name', question.ilgName);

  // Build children in order
  const children: OrderedNode[] = [];
  for (const child of (question.children || [])) {
    const built = buildNode(child as FormNode);
    if (built) children.push(built);
  }

  return createOrderedNode('question', attrs, children, question._rawAttrs, question._startTagClose);
};

// Build Condition node
const buildCondition = (cond: FormCondition): OrderedNode | null => {
  if (!cond) return null;
  const attrs = mergeAttrs(cond._originalAttrs, { '@_id': cond.id });
  setDefaultedAttr(attrs, cond._originalAttrs, 'equals', boolPlaceholder(cond.equals), boolPlaceholder('true'));
  setDefaultedAttr(attrs, cond._originalAttrs, 'value', cond.value || '', '');
  setDefaultedAttr(attrs, cond._originalAttrs, 'questionid', cond.questionId || '', '');
  return createOrderedNode('condition', attrs, [], cond._rawAttrs, cond._startTagClose);
};

// Build generic node (recursive)
const buildNode = (node: FormNode): OrderedNode | null => {
  if (!node) return null;
  switch (node.nodeType) {
    case 'section':
      return buildSection(node as FormSection);
    case 'subsection':
      return buildSubSection(node as FormSubSection);
    case 'description':
      return buildDescription(node as FormDescription);
    case 'warning':
      return buildWarning(node as FormWarning);
    case 'note':
      return buildNote(node as FormNote);
    case 'simpletext':
      return buildSimpleText(node as FormSimpleText);
    case 'validator':
      return buildValidator(node as FormValidator);
    case 'answer':
      return buildAnswer(node as FormAnswer);
    case 'unknown':
      return buildUnknown(node as FormUnknown);
    case 'option':
      return buildOption(node as FormOption);
    case 'reference':
      return buildReference(node as FormReference);
    case 'condition':
      return buildCondition(node as FormCondition);
    case 'question':
      return buildQuestion(node as FormQuestion);
    case 'entity': {
      const entity = node as FormEntity;
      const attrs = mergeAttrs(entity._originalAttrs, { '@_id': entity.id });
      setDefaultedAttr(attrs, entity._originalAttrs, 'title', entity.title, '');
      // keep original spelling type="" (E-Bar treats it as single)
      const origType = entity._originalAttrs?.type;
      if (!(origType !== undefined && (origType === entity.type || (origType === '' && entity.type === 'single')))) {
        attrs['@_type'] = entity.type;
      }
      setNumericAttr(attrs, entity._originalAttrs, 'min', entity.min);
      setNumericAttr(attrs, entity._originalAttrs, 'max', entity.max);
      // order/nextorder drive E-Bar's add-more bookkeeping; emit whenever the
      // original had them, the values are non-default, or this is a brand new
      // addmore entity (no _originalAttrs at all - created fresh via the UI's
      // addEntity action, which needs them from the start). A legacy source
      // entity that simply predates these attrs must not have them forced on
      // just because it happens to be type="addmore".
      const isBrandNew = entity._originalAttrs === undefined;
      if (entity._originalAttrs?.order !== undefined || entity.entityOrder !== 0 || (isBrandNew && entity.type === 'addmore')) {
        attrs['@_order'] = String(entity.entityOrder ?? 0);
      }
      if (entity._originalAttrs?.nextorder !== undefined || entity.nextOrder !== 1 || (isBrandNew && entity.type === 'addmore')) {
        attrs['@_nextorder'] = String(entity.nextOrder ?? 1);
      }
      if (entity.showInBarAdmin !== undefined) {
        attrs['@_showinbaradmin'] = boolPlaceholder(entity.showInBarAdmin);
      }
      setBoolAttr(attrs, entity._originalAttrs, 'isamended', entity.isAmended);
      setOptionalAttr(attrs, entity._originalAttrs, 'grouptype', entity.groupType);
      setOptionalAttr(attrs, entity._originalAttrs, 'ncbe_name', entity.ncbeName);
      setOptionalAttr(attrs, entity._originalAttrs, 'ncbe_value', entity.ncbeValue);
      setOptionalAttr(attrs, entity._originalAttrs, 'ilg_name', entity.ilgName);
      setOptionalAttr(attrs, entity._originalAttrs, 'ilg_value', entity.ilgValue);

      const children: OrderedNode[] = [];
      for (const child of (entity.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('entity', attrs, children, entity._rawAttrs, entity._startTagClose);
    }
    case 'conditionset': {
      const cs = node as FormConditionSet;
      const attrs = mergeAttrs(cs._originalAttrs, { '@_id': cs.id });
      setDefaultedAttr(attrs, cs._originalAttrs, 'operator', cs.operator, 'and');
      const children: OrderedNode[] = [];
      for (const child of (cs.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditionset', attrs, children, cs._rawAttrs, cs._startTagClose);
    }
    case 'conditionlogic': {
      const cl = node as FormConditionLogic;
      const attrs = mergeAttrs(cl._originalAttrs, { '@_id': cl.id });
      setDefaultedAttr(attrs, cl._originalAttrs, 'operator', cl.operator, 'or');
      const children: OrderedNode[] = [];
      // Add conditions first
      if (cl.conditions) {
        for (const cond of cl.conditions) {
          const built = buildCondition(cond);
          if (built) children.push(built);
        }
      }
      // Add other children
      for (const child of (cl.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditionlogic', attrs, children, cl._rawAttrs, cl._startTagClose);
    }
    case 'conditional': {
      const cond = node as FormConditional;
      const attrs = mergeAttrs(cond._originalAttrs, { '@_id': cond.id });
      setDefaultedAttr(attrs, cond._originalAttrs, 'condition', boolPlaceholder(cond.condition || 'true'), boolPlaceholder('true'));
      const children: OrderedNode[] = [];
      for (const child of (cond.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('conditional', attrs, children, cond._rawAttrs, cond._startTagClose);
    }
    case 'includeform': {
      const inc = node as FormIncludeForm;
      const attrs = mergeAttrs(inc._originalAttrs, { '@_id': inc.id });
      setDefaultedAttr(attrs, inc._originalAttrs, 'formname', inc.formName, '');
      setDefaultedAttr(attrs, inc._originalAttrs, 'type', inc.type, 'online');
      if (inc.title || inc._originalAttrs?.title !== undefined) {
        attrs['@_title'] = inc.title;
      }
      // defaults per E-Bar: multipleinclude=false, required=true; emit only when
      // the original carried the attr or the value is non-default
      if (inc.multipleInclude || inc._originalAttrs?.multipleinclude !== undefined) {
        attrs['@_multipleinclude'] = boolPlaceholder(inc.multipleInclude);
      }
      if (!inc.required || inc._originalAttrs?.required !== undefined) {
        attrs['@_required'] = boolPlaceholder(inc.required);
      }
      const children: OrderedNode[] = [];
      for (const child of (inc.children || [])) {
        const built = buildNode(child);
        if (built) children.push(built);
      }
      return createOrderedNode('includeform', attrs, children, inc._rawAttrs, inc._startTagClose);
    }
    case 'required-doc': {
      const doc = node as FormRequiredDocument;
      const attrs = mergeAttrs(doc._originalAttrs, { '@_id': doc.id });
      setDefaultedAttr(attrs, doc._originalAttrs, 'title', doc.title, '');
      setDefaultedAttr(attrs, doc._originalAttrs, 'preventsubmit', boolPlaceholder(doc.preventSubmit), boolPlaceholder(false));
      return createOrderedNode('required-doc', attrs, [], doc._rawAttrs, doc._startTagClose);
    }
    default:
      return null;
  }
};

// Build SubSection node
const buildSubSection = (subsection: FormSubSection): OrderedNode => {
  const attrs = mergeAttrs(subsection._originalAttrs, { '@_id': subsection.id });
  setDefaultedAttr(attrs, subsection._originalAttrs, 'title', subsection.title, '');
  if (subsection.showInBarAdmin !== undefined) {
    attrs['@_showinbaradmin'] = boolPlaceholder(subsection.showInBarAdmin);
  }
  // cleared depends/condition must not resurface from _originalAttrs
  if (subsection.depends !== undefined) {
    attrs['@_depends'] = subsection.depends;
  } else if (subsection._originalAttrs?.depends !== undefined) {
    delete attrs['@_depends'];
  }
  if (subsection.condition !== undefined) {
    attrs['@_condition'] = boolPlaceholder(subsection.condition);
  } else if (subsection._originalAttrs?.condition !== undefined) {
    delete attrs['@_condition'];
  }
  const children: OrderedNode[] = [];
  for (const child of (subsection.children || [])) {
    const built = buildNode(child);
    if (built) children.push(built);
  }
  return createOrderedNode('subsection', attrs, children, subsection._rawAttrs, subsection._startTagClose);
};

// Build Section node
const buildSection = (section: FormSection): OrderedNode => {
  const attrs = mergeAttrs(section._originalAttrs, { '@_id': section.id });
  setDefaultedAttr(attrs, section._originalAttrs, 'title', section.title, '');
  if (section.showInBarAdmin !== undefined) {
    attrs['@_showinbaradmin'] = boolPlaceholder(section.showInBarAdmin);
  }
  const children: OrderedNode[] = [];
  for (const child of (section.children || [])) {
    const built = buildNode(child);
    if (built) children.push(built);
  }
  return createOrderedNode('section', attrs, children, section._rawAttrs, section._startTagClose);
};

// Post-process XML to fix boolean placeholders
const fixBooleanPlaceholders = (xmlContent: string): string => {
  return xmlContent
    .replace(/__BOOL_TRUE__/g, 'true')
    .replace(/__BOOL_FALSE__/g, 'false');
};

// Boolean placeholders only ever appear in attribute values, and user text is
// not in the document at this point (it is still parked as tokens, see
// makeTextContent), so this pass cannot touch anything it should not.
//
// There is deliberately no global apostrophe pass here any more. Rewriting
// every "&apos;" to a literal apostrophe fixed the majority of the corpus by
// corrupting the 33 files that spell it "&apos;"; spelling is now decided per
// attribute from the source itself (attrSpelling / _rawAttrs).
const postProcessPlaceholders = (xmlContent: string): string =>
  fixBooleanPlaceholders(xmlContent);

// "]]>" inside a CDATA payload would terminate the section early and produce
// malformed XML; the standard fix is splitting into adjacent CDATA sections,
// which any parser (including ours) rejoins transparently.
const cdataSafe = (text: string): string => text.replace(/\]\]>/g, ']]]]><![CDATA[>');

// A payload written as bare text rather than CDATA has to be spelled out again,
// since the parser handed it back decoded. Same rule as attributes: the
// source's own bytes when the user did not touch it, a freshly-escaped value
// when they did.
const bareTextSpelling = (text: string, rawText: string | undefined): string => {
  // `text` is the trimmed, decoded payload, so trimming the decoded source is
  // exactly the round trip the parser performed: equal means untouched.
  if (rawText !== undefined && decodeXmlEntities(rawText).trim() === text) return rawText;
  return escapeTextValue(text);
};

// fast-xml-parser normalises CRLF to LF inside text and CDATA content, so a
// multi-line payload lifted out of a CRLF file comes back with bare LFs. These
// payloads are spliced in after applySourceLineEnding has already run (so that
// nothing can rewrite their bytes), which means they have to carry the
// document's line ending themselves.
const applyEol = (text: string, eol: string): string =>
  eol === '\n' ? text : text.replace(/\r\n/g, '\n').replace(/\n/g, eol);

// Final pass of the build: swap every parked token for its real bytes.
//
// Both token kinds are handled in ONE regex on purpose. `String.replace` never
// rescans what it inserted, so a description whose text literally contains
// "__FFRAW_0__" cannot be mangled by the raw-subtree pass, and a preserved raw
// subtree containing "__FFTXT_0__" cannot be mangled by the text pass. Running
// them as two sequential passes would break exactly those cases.
//
// The text branch also swallows the element's closing tag, which is what lets
// the node's own _textLayout decide where the payload and the closing tag sit
// relative to the opening tag — per node, not per file.
// Three things are swapped back in here, in ONE regex on purpose.
// `String.replace` never rescans what it inserted, so a description whose text
// literally contains "__FFRAW_0__" cannot be mangled by the raw-subtree branch,
// and a preserved raw subtree containing "__FFTXT_0__" cannot be mangled by the
// text branch. Sequential passes would break exactly those cases.
//
//   1. text payloads   - the branch also swallows the element's closing tag,
//                        which is what lets each node's own _textLayout decide
//                        where the payload and closing tag sit
//   2. raw subtrees    - an empty <__FFRAW_n__></__FFRAW_n__> placeholder
//                        element, already indented by the builder
//   3. start tags      - the marker attribute added by createOrderedNode,
//                        carrying the source's own "/>", " />" or " >"
// The start-tag marker as it appears in the built document, anchored to the end
// of a start tag. Branch 1 below wins the alternation for a text-bearing
// element, swallowing its whole start tag into `before`, so that branch has to
// resolve the marker itself or it would be written straight to the file.
const START_TAG_CLOSE_ATTR = String.raw` __ffclose="([^"]*)">`;
const START_TAG_CLOSE_AT_END_RE = new RegExp(`${START_TAG_CLOSE_ATTR}$`);

const DEFERRED_CONTENT_RE = new RegExp(
  [
    String.raw`^([ \t]*)([^\r\n]*?)__FFTXT_(\d+)__(<\/[A-Za-z][\w.:-]*>)`,
    // no backreference: capture groups are numbered across the whole alternation
    String.raw`<__FFRAW_(\d+)__><\/__FFRAW_\d+__>`,
    `${START_TAG_CLOSE_ATTR}(<\\/[A-Za-z_][\\w.:-]*>)?`,
  ].join('|'),
  'gm'
);

const spliceDeferredContent = (xmlContent: string, eol: string, indentUnit: string): string =>
  xmlContent.replace(
    DEFERRED_CONTENT_RE,
    (
      match,
      indent: string,
      before: string,
      textIdx: string,
      closeTag: string,
      rawIdx: string,
      startTagClose: string,
      closingTag: string | undefined
    ) => {
      if (startTagClose !== undefined) {
        // A self-closing spelling replaces the closing tag; anything else
        // (a plain " >") keeps whatever followed it.
        return startTagClose.endsWith('/>') ? startTagClose : `${startTagClose}${closingTag ?? ''}`;
      }
      if (rawIdx !== undefined) {
        const raw = rawSubtrees[parseInt(rawIdx, 10)];
        return raw !== undefined ? applyEol(raw, eol) : match;
      }
      const pending = pendingTexts[parseInt(textIdx, 10)];
      if (!pending) return match;
      const { text, layout, rawText } = pending;
      const body = applyEol(text, eol);
      const payload = layout.cdata
        ? `<![CDATA[${cdataSafe(body)}]]>`
        : bareTextSpelling(body, rawText === undefined ? undefined : applyEol(rawText, eol));
      const openGap = layout.openOwnLine ? `${eol}${indent}${indentUnit}` : '';
      const closeGap = layout.closeOwnLine ? `${eol}${indent}` : '';
      // `before` is this element's whole start tag, so it may still carry the
      // marker: <description id="1" __ffclose=" >"> becomes <description id="1" >.
      const startTag = before.replace(START_TAG_CLOSE_AT_END_RE, (_m, close: string) => close);
      return `${indent}${startTag}${openGap}${payload}${closeGap}${closeTag}`;
    }
  );

// Shared tail of buildXML/buildSubformXML. Order matters: placeholders and
// line endings are resolved while the document still contains only structure,
// and the real payload bytes are spliced in last so nothing can rewrite them.
const finalizeDocument = (built: string, sourceFormat: SourceFormat | undefined): string => {
  const indentUnit = sourceFormat?.indent ?? builderOptions.indentBy;
  const eol = sourceFormat?.lineEnding ?? '\n';
  const encoding = sourceFormat?.encoding ?? 'UTF-8';
  const trailingNewline = sourceFormat?.trailingNewline ? '\n' : '';
  // builder.build() always emits a leading "\n" before the root tag — trimStart
  // it so it doesn't stack with the "\n" after the XML declaration and leave a
  // blank line every save.
  const body = postProcessPlaceholders(built).trimStart();
  const document = applySourceLineEnding(
    `<?xml version="1.0" encoding="${encoding}"?>\n${body}${trailingNewline}`,
    sourceFormat
  );
  return spliceDeferredContent(document, eol, indentUnit);
};

// ============================================================================
// PUBLIC BUILD FUNCTIONS
// ============================================================================

// Build XML from form (questionnaire)
export const buildXML = (form: FormQuestionnaire): string => {
  resetRawSubtrees();
  resetPendingTexts();
  fallbackTextLayout = houseTextLayout(form._sourceFormat);
  const builder = new XMLBuilder({ ...builderOptions, indentBy: form._sourceFormat?.indent ?? builderOptions.indentBy });

  // Build questionnaire
  const questionnaireAttrs = mergeAttrs(form._originalAttrs, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
  });
  setDefaultedAttr(questionnaireAttrs, form._originalAttrs, 'suffix', form.suffix, '');
  setDefaultedAttr(questionnaireAttrs, form._originalAttrs, 'title', form.title, 'Untitled Form');

  const sectionNodes: OrderedNode[] = [];
  for (const child of (form.children || [])) {
    const built = buildNode(child);
    if (built) sectionNodes.push(built);
  }

  const xmlObj: OrderedNode[] = [
    createOrderedNode('questionnaire', questionnaireAttrs, sectionNodes, form._rawAttrs, form._startTagClose),
  ];

  return finalizeDocument(builder.build(xmlObj), form._sourceFormat);
};

// Create empty form
export const createEmptyForm = (title: string = 'New Form', customSuffix?: string): FormQuestionnaire => {
  const suffix = customSuffix || generateSuffix();
  return {
    id: `1${suffix}`,
    nodeType: 'questionnaire',
    title,
    suffix,
    nextId: 2,
    children: [],
  };
};

// Parse Subform XML
export const parseSubformXML = (xmlString: string): FormSubform | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    // Find subform element
    let subformNode: OrderedNode | null = null;
    for (const node of result) {
      if ('subform' in node) {
        subformNode = node;
        break;
      }
    }

    if (!subformNode) {
      console.error('No subform element found');
      return null;
    }

    indexRawSpellings(xmlString, result);
    indexStartTagClosings(xmlString, result);

    const attrs = getAttrs(subformNode);
    const children = subformNode['subform'] as OrderedNode[];

    const form: FormSubform = {
      id: String(attrs['@_id'] || generateId()),
      nodeType: 'subform',
      title: String(attrs['@_title'] || 'Untitled Subform'),
      suffix: String(attrs['@_suffix'] || ''),
      nextId: parseInt(String(attrs['@_nextid'] || '1'), 10) || 1,
      children: parseChildren(children),
      _originalAttrs: extractOriginalAttrs(attrs),
      _rawAttrs: rawAttrsOf(subformNode),
      _startTagClose: startTagCloseIndex.get(subformNode),
      _sourceFormat: detectSourceFormat(xmlString),
    };

    return form;
  } catch (error) {
    console.error('Failed to parse Subform XML:', error);
    return null;
  }
};

// Build Subform XML - now uses shared helpers
export const buildSubformXML = (form: FormSubform): string => {
  resetRawSubtrees();
  resetPendingTexts();
  fallbackTextLayout = houseTextLayout(form._sourceFormat);
  const builder = new XMLBuilder({ ...builderOptions, indentBy: form._sourceFormat?.indent ?? builderOptions.indentBy });

  // Build subform
  const subformAttrs = mergeAttrs(form._originalAttrs, {
    '@_id': form.id,
    '@_nextid': String(form.nextId),
  });
  setDefaultedAttr(subformAttrs, form._originalAttrs, 'suffix', form.suffix, '');
  // A subform's order is E-Bar bookkeeping the model does not track; only
  // brand-new subforms need it seeded, an existing one keeps its own value.
  setDefaultedAttr(subformAttrs, form._originalAttrs, 'order', form._originalAttrs?.order ?? '0', '0');
  setDefaultedAttr(subformAttrs, form._originalAttrs, 'title', form.title, 'Untitled Subform');

  const childNodes: OrderedNode[] = [];
  for (const child of (form.children || [])) {
    const built = buildNode(child);
    if (built) childNodes.push(built);
  }

  const xmlObj: OrderedNode[] = [
    createOrderedNode('subform', subformAttrs, childNodes, form._rawAttrs, form._startTagClose),
  ];

  return finalizeDocument(builder.build(xmlObj), form._sourceFormat);
};

// Create empty subform
export const createEmptySubform = (title: string = 'New Subform', customSuffix?: string): FormSubform => {
  const suffix = customSuffix || generateSuffix();
  return {
    id: `1${suffix}`,
    nodeType: 'subform',
    title,
    suffix,
    nextId: 2,
    children: [],
  };
};

// Detect XML type (questionnaire or subform)
export const detectXMLType = (xmlString: string): 'questionnaire' | 'subform' | null => {
  try {
    const parser = new XMLParser(parserOptions);
    const result = parser.parse(xmlString) as OrderedNode[];

    for (const node of result) {
      if ('questionnaire' in node) return 'questionnaire';
      if ('subform' in node) return 'subform';
    }
    return null;
  } catch {
    return null;
  }
};

// Parse any XML (auto-detect type)
export const parseAnyXML = (xmlString: string): FormRoot | null => {
  const type = detectXMLType(xmlString);
  if (type === 'questionnaire') return parseXML(xmlString);
  if (type === 'subform') return parseSubformXML(xmlString);
  return null;
};

// Build any form XML (auto-detect type)
export const buildAnyXML = (form: FormRoot): string => {
  if (form.nodeType === 'questionnaire') return buildXML(form);
  if (form.nodeType === 'subform') return buildSubformXML(form);
  return '';
};
