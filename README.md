# ReadBooks

Free, step-by-step reading roadmaps for hard technical books.

Great technical books often have a surprising amount of free supporting
material — the author posts sample chapters, the university publishes the whole
course as video, the problem sets go online. It is genuinely free and genuinely
legal. It is also scattered across three sites and numbered by the course
rather than the book, so following it in order is miserable.

This site puts that material back into the book's own order, links each section
to whatever exists for it, and remembers how far you got.

**We host no copyrighted material.** Every reading link points at the author's
or university's own server. See [the copyright position](#copyright).

---

## Stack

| | |
|---|---|
| Framework | [Astro](https://astro.build) 7, static output |
| Hosting | Cloudflare Pages (free tier) |
| Client JS | ~4 KB of hand-written TypeScript, no framework runtime |
| Persistence | `localStorage`, with JSON export/import |
| Cost | $0, permanently |

There is no server, no database, and no accounts. The whole site is static
files, which is what keeps it free at any traffic level rather than free until
it gets popular.

## Getting started

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server on `localhost:4321` |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run check` | Typecheck + validate every book against the schema |
| `npm run check:spacing` | Catch text welded to inline tags (see below) |
| `npm run check:links` | Verify every outbound link still resolves |
| `npm run verify` | `check` + `build` + `check:spacing` |

## How it is put together

```
src/
├─ site.config.ts       Branding, canonical URL, storage namespace — one file
├─ content.config.ts    Zod schemas + build-time integrity rules
├─ content/books/
│  └─ <book-slug>/
│     ├─ book.yaml      The whole book: parts, sections, links, resources
│     └─ guides/*.md    Optional per-section study guides
├─ lib/
│  ├─ storage.ts        StorageAdapter interface + localStorage implementation
│  ├─ progress.ts       Pure progress/streak logic, no DOM
│  ├─ tracker.ts        The only client-side script
│  └─ books.ts          Build-time link resolution and integrity checks
├─ components/          Astro components, all server-rendered
└─ pages/
   ├─ index.astro                  Landing: book grid
   ├─ books/[slug].astro           Book roadmap
   └─ books/[slug]/[section].astro Study guide
```

### Static first, JavaScript second

Every part, section, and link is rendered at build time. The tracker attaches
saved state to that markup through `data-*` hooks; it never renders content.

That means all 46 section titles of a book are crawlable, and with JavaScript
disabled the page still reads and every link still works — only the checkboxes
go inert. Section toggles are real `<input type="checkbox">` elements and part
accordions are native `<details>`, so keyboard support, screen-reader
semantics, and the checked state all come from the platform rather than from
our code.

### Where progress lives

| Key | Holds |
|---|---|
| `readbooks:v1:progress:<book-slug>` | Sections read, notes, checklist, per book |
| `readbooks:v1:activity` | History, last active day, streak — site-wide |

Progress is per-book so two books cannot collide; the streak is site-wide so it
survives moving between them. Nothing is transmitted anywhere. Export/import
moves progress between devices in place of an account.

## Adding a book

A book is a data file, not code. See [CONTRIBUTING.md](CONTRIBUTING.md).

The short version: create `src/content/books/<slug>/book.yaml`, matching the
directory name to the `slug` field. The schema validates it at build time and
will reject a lecture reference that does not resolve, a duplicate section
code, or a study guide pointing at a section that does not exist.

**A book qualifies only if its supporting material is published free by the
author, publisher, or university.** We do not link to unauthorised copies.

## Two checks worth knowing about

**`check:spacing`** exists because Astro trims trailing whitespace when a tag
begins a new source line, so

```astro
See the
<a href="/copyright">copyright notice</a>
```

renders as "See thecopyright notice" with no build warning. It found three real
instances the first time it ran.

**`check:links`** runs weekly in CI and opens an issue when an outbound link
dies. It caught six lecture URLs that had been broken since the prototype —
MIT encodes punctuation from lecture titles into its slugs, and the stripped
versions redirect-looped instead of returning 404, so they looked fine to
anyone who did not click them.

## Deploying

Cloudflare Pages, connected to the repository:

- **Build command** `npm run build`
- **Output directory** `dist`
- **Node version** 22

Pushes to `main` deploy; pull requests get preview URLs. No secrets or tokens
are needed, so none live in this repository.

Before the first deploy, set `url` and `repo` in
[`src/site.config.ts`](src/site.config.ts) to the real values.

## Copyright

- We host **no** copyrighted books, chapters, or PDFs. None are in this
  repository and none are served from the site.
- Every reading link points at the rights holder's own server.
- We do not reproduce publisher cover art; covers are typographic placeholders.
- MIT OpenCourseWare material is linked under CC BY-NC-SA 4.0, attributed on
  both the book page and the copyright page. The site is non-commercial: no
  ads, nothing for sale.
- Where a book is sold, we link to buy it.

Site code is MIT licensed. The study guides and other prose we write are
[CC BY-SA 4.0](CONTENT-LICENSE.md). Rights holders can request removal of any
link — see the copyright page for contact details.
