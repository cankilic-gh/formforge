---
name: ebar-forms
description: Create, edit, or fix E-Bar bar-admission form XML — questionnaire and subform files under states/<st>/xml/{forms,subforms}. Use when a ticket asks to add, change, reword, reorder, or remove questions, sections, subsections, conditionals, entities, options, validators, or required documents in a bar form; when building a new form from a spec (PDF/Word/plain description); or when a form fails to load, renders wrong, or needs its ids/conditions repaired. Loads the live E-Bar engine contract from FormForge and gates every change through validate + roundtrip + scope diff before reporting done.
---

# FormForge — E-Bar form authoring

E-Bar forms have **no DTD or XSD**. The rules live in the Java engine, and a
violation either crashes form loading for every applicant or silently renders
something invisible. FormForge encodes that contract and can prove an edit is
safe. Use it — do not hand-edit E-Bar XML from memory.

## 0. Locate FormForge

```bash
FF="${FORMFORGE_PATH:-$HOME/Documents/GitHub/formforge}"
```

All commands below run from anywhere via `npm --prefix "$FF" run -s cli -- <cmd>`.
If `$FF` does not exist, stop and ask where FormForge is checked out.

## 1. Load the engine contract — every time, before editing

```bash
npm --prefix "$FF" run -s cli -- engine-rules
```

This prints the full contract (elements, required attributes, question types,
date/state formats, condition operators, entity types, validators), generated
from FormForge's `engineModel.ts`. It is the same ground truth that drives the
validator and the web UI, so it can never drift.

**Read this output before writing any XML.** Never answer from memory about a
question type, an attribute default, or an operator — the details that matter
(which attributes crash when missing, which types are case-sensitive, which
need `<option>` or `<reference>` children) are exactly the ones easy to
misremember.

## 2. Understand the current form before changing it

```bash
npm --prefix "$FF" run -s cli -- validate <form.xml>     # pre-existing problems
npm --prefix "$FF" run -s cli -- roundtrip <form.xml>    # is it cleanly modelled?
```

Run these on the **untouched** file first. If the form already has validation
errors, say so — do not silently absorb someone else's bug into your diff.

Keep a pristine copy to diff against:

```bash
cp <form.xml> /tmp/ff-original.xml
```

## 3. Edit surgically

- Make the **smallest possible** textual change. Do not reformat, re-indent, or
  reorder anything the ticket did not ask about — the whole point of the parser
  work is byte-level preservation, and a reformatted file makes review
  impossible.
- New nodes need ids. Ids are `<n><suffix>` where `<suffix>` is the form's own
  suffix, and the root's `nextid` must stay **greater than every id in use**.
  Bump `nextid` when you add nodes.
- References must stay consistent: `condition@questionid` must point at a real
  question; `subsection@depends` at a real conditionset/conditionlogic.
- Rich text lives in CDATA and may contain real HTML (including `<a href>`
  links). Preserve markup exactly; never strip anchors.

## 4. Gate — mandatory before you report anything

```bash
npm --prefix "$FF" run -s cli -- gate /tmp/ff-original.xml <form.xml>
```

One command, exit 0 only when **all** of these hold:

- the edited file parses as a questionnaire/subform,
- it has **zero validation errors**,
- it round-trips with zero semantic loss (the engine sees exactly what the file says),
- and it prints the **scope diff** — every semantic difference from the original.

Read the `scope.changes` list and confirm each entry is something the ticket
asked for. An unexpected entry means you changed something you did not intend:
fix it, do not explain it away.

If the gate exits non-zero, **it is not done**. Fix and re-run until it passes.
Never report success on a failing or unrun gate.

## 5. Report

State what changed, item by item, and paste the gate's `ok`, `validation`, and
`scope.changeCount` as evidence.

Then list **uncertainties**. You must never present a guess as a certainty:
every assumption, ambiguous instruction, or inferred detail — a field's exact
type, whether something is required, how a label should be worded, a structural
judgment call — gets a short, specific line, even where you went ahead with your
best guess. Leave the list empty only if literally everything was unambiguous.

## Generating a new form from a spec

Same loop, with two differences:

1. Start from a minimal valid questionnaire (or `File > New` in the FormForge UI)
   rather than an empty file, so the root carries a `suffix` and `nextid`.
2. Build **real structure** — sections, subsections, conditional follow-ups,
   repeating entities — not a flat list of questions. The contract from step 1
   describes what is available; a spec that says "list each prior employer"
   means an `addmore` entity, not ten copies of a question.

Read the source spec fully before building, and record in uncertainties every
place the spec did not specify something you had to choose.

## The visual editor

For anything easier to see than to reason about — how a form renders, what a
conditional actually shows, reviewing a diff — the FormForge web UI runs with
`npm --prefix "$FF" run dev` and includes a **Test Lab** (`/test`) that
round-trips a file and shows the result. Its AI Fix / AI Generate buttons run
this same workflow interactively and draw from the local Claude subscription.
