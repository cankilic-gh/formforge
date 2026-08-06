// engineRulesPrompt.ts  (server-only, but has no server-only APIs — pure string building)
//
// Renders engineModel.ts (the single source of truth for the E-Bar engine
// contract) into a system-prompt-ready text block for the AI Fix agent. This
// is generated FROM THE DATA, not hand-written prose, so it can never drift
// from the same module that drives validation.ts and the /reference docs.

import {
  ELEMENTS,
  QUESTION_TYPES,
  DATE_FORMATS,
  STATE_FORMATS,
  TEXT_FORMATS,
  CONDITION_OPERATORS,
  ENTITY_TYPES,
  PROFILE_REFERENCE_FIELDS,
  KNOWN_VALIDATOR_SHORTNAMES,
} from './engineModel';

const renderElement = (tag: string): string => {
  const el = ELEMENTS.find((e) => e.tag === tag);
  if (!el) return '';
  const attrLines = el.attrs
    .map((a) => {
      const flag = a.whenMissing === 'crash' || a.whenMissing === 'invisible' ? 'REQUIRED (crashes/hides if missing)' : 'optional';
      const enumNote = a.values && a.values.length ? ` values: ${a.values.map((v) => `"${v}"`).join(' | ')}` : '';
      return `    - ${a.name} [${flag}]${enumNote} — ${a.effect}`;
    })
    .join('\n');
  const children = el.allowedChildren.length ? ` (children: ${el.allowedChildren.join(', ')})` : '';
  const notes = el.notes && el.notes.length ? `\n    Notes: ${el.notes.join(' ')}` : '';
  return `  <${tag}>${children} — ${el.purpose}\n${attrLines}${notes}`;
};

export const buildEngineRulesPrompt = (): string => {
  const elementsBlock = ELEMENTS.map((e) => renderElement(e.tag)).join('\n\n');

  const questionTypesBlock = QUESTION_TYPES.map((t) => {
    const flags = [
      t.needsOptions ? 'needs <option> children' : null,
      t.needsReference ? 'needs a <reference> child' : null,
      t.caseSensitive ? 'CASE-SENSITIVE match' : null,
    ]
      .filter(Boolean)
      .join('; ');
    return `  type="${t.type === '' ? '(empty)' : t.type}" — ${t.description}${flags ? ` [${flags}]` : ''}`;
  }).join('\n');

  const dateFormatsBlock = DATE_FORMATS.map((f) => `  format="${f.value}" — ${f.label}: ${f.note}`).join('\n');
  const stateFormatsBlock = STATE_FORMATS.map((f) => `  format="${f.value}" — ${f.label}: ${f.note}`).join('\n');
  const textFormatsBlock = TEXT_FORMATS.map((f) => `  format="${f.value}" — ${f.label}: ${f.note}`).join('\n');

  const operatorsBlock = CONDITION_OPERATORS.map((o) => `  operator="${o.value}" (${o.appliesTo}) — ${o.semantics}`).join('\n');

  const entityTypesBlock = ENTITY_TYPES.map((e) => `  type="${e.value === '' ? '(empty)' : e.value}" — ${e.note}`).join('\n');

  const profileFieldsList = PROFILE_REFERENCE_FIELDS.map((f) => f.value).join(', ');

  const validatorList = Array.from(KNOWN_VALIDATOR_SHORTNAMES).join(', ');

  return `You are editing an E-Bar bar-admissions form XML file. There is NO DTD/XSD for
this format — the rules below ARE the engine's contract, distilled from the real
Java engine (NodeManager.populateNodes, the ilg.common.forms model classes, and
the Question/Reference renderers). Violating them either crashes the entire
form-loading process for every applicant, or silently renders something invisible
or wrong. Follow them exactly.

## Identity & ids (the #1 source of crashes when adding new nodes)

- Every element has an integer "id" attribute. It is read with NO null-check and
  parsed as an int — a missing or non-numeric id crashes the ENTIRE form load for
  every applicant, not just the broken question.
- id = "<numeric prefix><suffix>". The suffix is fixed per form (see the root
  <questionnaire>/<subform> "suffix" attribute) — never invent a different suffix.
- The root element's "nextid" attribute is the next unused numeric prefix. EVERY
  new node you add (a new <question>, <option>, <description>, <condition>,
  <entity>, <conditionset>, ...) must get its own unique numeric prefix, and you
  MUST bump "nextid" so it stays strictly greater than every id prefix now in use.
  Forgetting to bump nextid, or reusing an id, causes duplicate-id or nextid
  errors that fail the form.
- All human-readable text (labels, options, notes, warnings) MUST be inside
  <![CDATA[ ... ]]>. Raw child tags outside CDATA are silently stripped by the
  engine.

## Elements (tag, allowed children, and every attribute's contract)

${elementsBlock}

## Question types (the "type" attribute on <question> — nothing else exists)

${questionTypesBlock}

Question attrs always present: type, format, required, triggervalue, comment.
"required=\"true\"" is the only spelling that makes an answer mandatory; anything
else (including required="") is false. maxlength defaults to 500 for char, 5000
for text.

## Date format vocabulary (format="..." on date / emp_date_* / res_date_* types)

${dateFormatsBlock}

## State format vocabulary (format="..." on type="state")

${stateFormatsBlock}

## Text format vocabulary (format="..." on type="char" / type="text")

${textFormatsBlock}

## Conditional logic — two independent mechanisms

A. <conditionset operator="..."> holds trigger <question>(s) + <conditional
   condition="true|false"> branches (or ";v1;v2;" token lists for "switch").
   Operators:
${operatorsBlock}

B. <conditionlogic operator="and|or"> holds <condition questionid="..."
   value="..." equals="true|false"/> children that reference an EXISTING
   question's numeric id elsewhere in the form. A <conditionlogic> MUST live
   inside a <subsection> or <entity> — placed anywhere else it NPEs at runtime.

To add a "show this question only if the answer to question X is yes" follow-up,
either wrap the new question in a <conditional condition="true"> inside a
<conditionset> whose trigger is question X (mechanism A), or gate a whole
<subsection> with depends="<conditionset/conditionlogic id>" condition="true|false"
(mechanism B via subsection@depends).

## Entity types (the "type" attribute on <entity> — repeating/grouped blocks)

${entityTypesBlock}

For "addmore" entities: the order="0" instance is the authored template; only
one instance is written in the XML even though applicants can add more at
runtime. min/max are both REQUIRED (max="0" means unlimited).

## Profile reference fields (valid "field" values on <reference table="profile" field="...">)

${profileFieldsList}

Do not invent a field name outside this list — it silently returns empty at
runtime with no error, so a typo looks fine in the XML but breaks for the
applicant.

## Known validator classes (valid "validatorclass" short names)

${validatorList}

These are usually written as "ilg.ebar.forms.validators.<Name>" (the fallback
"ilg.common.validators.<Name>" also resolves). Only use a validatorclass from
this list unless the ticket explicitly names a new one.

## Your task discipline

- Make ONLY the change the ticket instruction describes. Do not touch
  unrelated text, ids, whitespace, or formatting elsewhere in the file.
- Use the apply_edit tool with small, precise old_string/new_string pairs —
  the same discipline as a text editor's find-and-replace. old_string must be
  copied EXACTLY (including whitespace/indentation) from the current file and
  must be unique unless you pass replace_all.
- Never resend or rewrite the whole file — you already have it in full in this
  conversation; only send the minimal diff for each change.
- After every apply_edit you will get back the current validation result
  (errors/warnings). Errors mean the real engine would crash or hide the
  question — fix them before continuing. Pre-existing warnings unrelated to
  your change are not your responsibility.
- When you are completely done, reply with plain text (no more tool calls)
  summarizing exactly what you changed and why. That is your final answer.`;
};
