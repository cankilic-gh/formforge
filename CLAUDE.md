# FormForge — working notes for Claude

README covers features and setup. This file covers what you cannot infer from
the code: the invariants, the gates, and the traps that have already bitten us.

## What this project is for

FormForge edits **E-Bar bar-admission form XML** — the questionnaire/subform
files under `states/<st>/xml/{forms,subforms}/` in the ILG-EBAS-E-Bar repo.
Those files are consumed by a Java engine with **no DTD and no XSD**. The rules
are whatever `NodeManager.populateNodes` and the `ilg.common.forms` models do at
runtime. A malformed attribute does not fail loudly: it either crashes form
loading for **every applicant of that state**, or renders an invisible/wrong
question that nobody notices until an applicant is blocked.

So the product's real job is not "edit XML" — it is **change a form without
breaking it, and be able to prove it**.

## The two invariants everything else serves

**1. `src/lib/engineModel.ts` is the single source of truth.** Every rule about
elements, attributes, question types, formats, operators and validators lives
there, distilled from the Java engine (the file header cites the exact classes).
It feeds three consumers so they cannot drift: `validation.ts` (the checks),
`engineRulesPrompt.ts` (what the AI agent is told), and the `/reference` docs.
**If you learn something new about the engine, change `engineModel.ts`** — never
hard-code a rule into a component, a prompt, or a validator.

**2. Saving a form must be byte-faithful.** A user who edits one label must get a
diff of one label. `xmlParser.ts` therefore preserves `_originalAttrs` (original
attribute spellings, including empty ones like `ncbe_name=""`), `_sourceFormat`
(line endings, indent, encoding, trailing newline, CDATA closing style), and any
element FormForge does not model (`FormUnknown`, re-emitted verbatim). Cosmetic
reformatting is a **bug**, not a tidy-up.

## Verify before reporting

Never report a form change as done without running the gate:

```bash
cp form.xml /tmp/original.xml          # before editing
npm run -s cli -- gate /tmp/original.xml form.xml
```

Exit 0 only if the file parses, has zero validation errors, round-trips with no
semantic loss, **and** it prints the scope diff — every semantic difference from
the original. Read that list and confirm each entry is something you meant to
change; an unexpected entry means you broke something you were not asked to touch.

Other CLI commands (`npm run -s cli -- <cmd>`):

| Command | Use |
|---|---|
| `engine-rules` | Print the live engine contract. Load this before authoring XML — never work from memory. |
| `validate <f>` | Rule + reference-integrity check |
| `roundtrip <f>` | Prove parse→build loses nothing |
| `diff <a> <b>` | Semantic diff between two files |
| `gate <orig> <edited>` | All of the above, as one pass/fail |

Code changes also need `npx tsc --noEmit`, `npm test`, and `npm run build`.
The suite includes fixture round-trips that run everywhere, plus a large corpus
round-trip that runs only when the E-Bar checkout is present.

## Environment

| Variable | Purpose |
|---|---|
| `EBAR_REPO_PATH` | ILG-EBAS-E-Bar checkout; enables Test Lab's committed-vs-working comparison |
| `EBAR_STATES_DIR` | Corpus root for tests; without it the corpus suites **skip silently** |
| `AUTH_USER`, `AUTH_PASS`, `AUTH_SECRET` | Login gate. Required in production — middleware fails closed without them. Dev without them = no gate. |
| `AI_FIX_MODEL` | Override the model used by AI Fix / AI Generate |
| `RUN_LIVE_AI_FIX_TESTS` | Opt in to tests that make real AI calls |

AI Fix / AI Generate authenticate through the machine's existing Claude
subscription login via the Agent SDK — **no `ANTHROPIC_API_KEY`**. If they fail
with "OAuth session expired", the fix is `claude /login` in a terminal.

A skipped corpus suite is not a passing corpus suite. If you are relying on
corpus coverage, confirm `EBAR_STATES_DIR` actually resolves first.

## The `ebar-forms` skill

`skills/ebar-forms/SKILL.md` packages this workflow so it works from any
directory (notably from inside the E-Bar repo, where the forms actually live).
Install it by symlink so this repo stays the source of truth:

```bash
ln -sfn "$PWD/skills/ebar-forms" ~/.claude/skills/ebar-forms
```

It resolves FormForge via `FORMFORGE_PATH`, defaulting to
`$HOME/Documents/GitHub/formforge`. Set the variable if the checkout lives elsewhere.

## Traps that have already caused real bugs

- **Cleared fields resurfacing.** `mergeAttrs` copies `_originalAttrs` in first,
  so an optional attribute the user *cleared* will silently come back unless the
  builder removes it. Use `setOptionalAttr` / `setBoolAttr` / `setDefaultedAttr`
  for optional attributes — never a bare `if (value) attrs[...] = value`.
- **Placeholders vs. user text.** The builder emits `__BOOL_TRUE__` / `__FFRAW_n__`
  tokens and resolves them afterwards. That fix-up runs **outside CDATA only**, so
  a literal token typed by a user survives. Keep it that way.
- **`]]>` in rich text** must be split across adjacent CDATA sections or the file
  becomes malformed.
- **Store mutations and `nextId`.** `generateId()` bumps `form.nextId` via `set()`.
  Clone the working copy **after** generating ids, or the bumps are overwritten
  (this exact bug shipped in `duplicateNode`).
- **Id references.** Renaming ids must remap `condition@questionid` and
  `subsection@depends`, including `conditionlogic`'s separate `conditions` array,
  which is not part of `children`.
- **Committing from a stale buffer.** A commit made from an out-of-date editor
  copy silently reverted finished toolbar work and reached production. Always
  `git diff` before committing and confirm the diff contains only what you meant.

## Conventions

Turkish for discussion with the user; English for code, comments and commits.
Keep diffs tight and in the style of the file you are editing. Don't add
dependencies or new frameworks for a problem the repo already solves.
