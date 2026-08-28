# Contributing

Two kinds of contribution are useful here: **adding a book** and **writing
study guides**. Neither requires touching application code.

## The one hard rule

A book qualifies only if its supporting material is **published free by the
author, publisher, or university**.

Links to unauthorised copies, file lockers, or shadow libraries will not be
merged, regardless of how useful the material is. This project works only
because it stays scrupulous about that, and one bad link would put the whole
thing at risk.

If you are unsure whether something qualifies, ask in an issue before doing the
work.

---

## Adding a book

### 1. Create the directory

```
src/content/books/<book-slug>/book.yaml
```

The directory name **must** equal the `slug` field inside the file — the
directory name is what routes the page, and the build fails if they disagree.

Use lowercase kebab-case: `linear-algebra-and-learning-from-data`.

### 2. Write `book.yaml`

Use the existing book as a working reference. The shape:

```yaml
slug: my-book-slug          # must match the directory name
title: The Book Title
author: A. Author
year: 2021
publisher: Some Press       # optional
isbn: "978-..."             # optional
order: 2                    # sort position on the landing page
status: available           # or `planned`, to list it without a roadmap

tagline: One line for the book card.
description: >-
  A paragraph for the book page header.

officialPage: https://...   # the rights holder's own page
buyUrl: https://...         # optional, but include it where one exists

cover:                      # typographic only — never publisher cover art
  initials: MB
  accent: "#5b8cff"
  accent2: "#7ad3b2"

accessNotice: >-
  Say plainly what is and is not free. Do not oversell it — a reader who
  arrives expecting a full free book and finds three sample chapters will
  leave, and rightly.

course:                     # optional: a free course the book maps onto
  name: Course 101 — Some University
  url: https://...
  license: CC BY-NC-SA 4.0
  licenseUrl: https://...
  lectureBase: https://.../resources/   # lecture `slug`s resolve against this

defaults:                   # keeps per-section links free of repetition
  problemsUrl: https://...  # a problems chip is added to every section
  fallbackUrl: https://...  # used when a section has no links of its own
  fallbackLabel: Find this section in the contents

resources:                  # book-wide links, shown in a panel
  - label: Table of Contents
    url: https://...
    kind: pdf               # pdf | video | playlist | page | solutions
    source: A. Author / University   # shown for attribution
    icon: "📑"

lectures:                   # written once, referenced by number
  - n: 1
    title: What Lecture 1 Covers
    slug: lecture-1-...     # appended to course.lectureBase
    # or: url: https://...  # a full URL, for lectures hosted elsewhere

parts:
  - id: I                   # roman numeral or short label; also the anchor
    title: Part Title
    summary: One line under the part heading.
    sections:
      - code: I.1           # unique within the book — it is the storage key
        title: Section Title
        guide: i-1          # optional -> guides/i-1.md
        links:
          - kind: section-pdf
            url: https://...
          - kind: lecture
            ref: 1          # must exist in `lectures`
    checklist:
      - Something concrete to do before moving on
```

### 3. Get the URLs right

**Take lecture URLs from the publisher's own index page, not by pattern.**
Universities encode punctuation from lecture titles into their slugs. Six links
in the first book were broken for exactly this reason, and because they
redirect-looped rather than returning 404, they looked fine until someone
clicked one.

### 4. Verify

```bash
npm run verify
npm run check:links
```

The schema enforces the things that break quietly:

- every `lecture` `ref` resolves in the book's registry
- section codes are unique — a collision would silently merge two sections'
  saved progress
- part ids and lecture numbers are unique
- a `problems` link with no URL has a `defaults.problemsUrl` to fall back on
- lectures using `slug` have a `course.lectureBase` to resolve against
- every `guide:` names a file that exists

A failure here is a build failure with a message naming the section.

---

## Writing a study guide

Create `src/content/books/<book-slug>/guides/<section>.md` and point the
section at it with `guide: <section>`.

```markdown
---
title: Section Title
section: I.1          # must match a section `code` in book.yaml
summary: >-
  Two sentences. Used as the page description and shown under the heading.
readingMinutes: 6
---

## The one idea
## Why it matters later
## What to actually do
## Check yourself
## Common sticking points
```

That structure is a default, not a rule — but the guides should earn their
place. Aim for what a good tutor would say and a textbook will not:

- **What this section is really about**, stated once, plainly.
- **What it sets up later.** A section is much easier to care about when you
  know which later chapter collapses without it.
- **Something to actually do.** Concrete, small, checkable.
- **Where people get stuck**, and why — including the mistakes worth making
  once deliberately.

### Copyright, for guides

Write in your own words. Do not reproduce the book's text, worked examples, or
exercises. Short attributed quotes are fine; paraphrasing a whole section
closely is not — the point is commentary that sends people *to* the book.

Contributed guides are published under [CC BY-SA 4.0](CONTENT-LICENSE.md).

---

## Code contributions

`npm run verify` must pass. Beyond that:

- **Keep the page working without JavaScript.** Content is server-rendered;
  client script may enhance it but must never be required to read it.
- **Use platform elements.** Real checkboxes, real `<details>`, real labels.
  Do not rebuild them with `div`s and ARIA.
- **Talk to `StorageAdapter`**, never to `localStorage` directly.
- **Keep progress logic pure.** `lib/progress.ts` has no DOM and no storage
  access; keep it that way so the rules stay testable.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `content:`, `chore:`, `ci:`, `test:`, `docs:`.
