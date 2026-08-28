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
| Client JS | ~16 KB of hand-written TypeScript, no framework runtime |
| Type | Literata, IBM Plex Sans, IBM Plex Mono, self-hosted by Astro |
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
├─ styles/
│  ├─ tokens.css       The design system: colour, type, space, motion
│  ├─ global.css       Reset, primitives, buttons, prose, masthead
│  ├─ roadmap.css      Book page: contents rail and section rows
│  ├─ home.css         Landing page
│  └─ guide.css        Study guide pages
├─ components/          Astro components, all server-rendered
└─ pages/
   ├─ index.astro                  Landing: featured book record
   ├─ books/[slug].astro           Book roadmap
   └─ books/[slug]/[section].astro Study guide
```

### Static first, JavaScript second

Every part, section, and link is rendered at build time. The tracker attaches
saved state to that markup through `data-*` hooks; it never renders content.

That means all 46 section titles of a book are crawlable, and with JavaScript
disabled the page still reads and every link still works — only the checkboxes
go inert. Section toggles are real `<input type="checkbox">` elements, so
keyboard support, screen-reader semantics, and the checked state all come from
the platform rather than from our code.

### The design system

The reference is scholarly publishing rather than software: a book set on good
paper. Three rules follow from that and are enforced throughout, so breaking one
should feel deliberate:

1. **No shadows.** There is not one `box-shadow` in the stylesheets. Hierarchy
   comes from type size, weight, ink colour, and hairline rules.
2. **No corner radius.** `--radius: 0`, including buttons and inputs.
3. **One accent, carrying information only.** Vermillion marks where you are in
   the book, the way a ribbon does. It is never decoration.

A section's state is three-valued, and colour is only one of its channels, so it
survives greyscale and colour blindness:

| State | Mark | Row |
|---|---|---|
| Not read | hairline square outline | plain |
| Next up | vermillion outline | vermillion rule at the left edge |
| Read | solid ink square | title recedes to grey |

Every ink and accent value in [`tokens.css`](src/styles/tokens.css) carries its
measured contrast ratio against the paper. `--ink-4` is documented non-text: it
is for borders and `text-decoration-color`, and fails AA as a `color`.

### Where the book page layout came from

46 sections in a single scroll gives a reader no sense of position, and the
earlier accordions hid the contents behind seven clicks and broke ctrl-F. The
page is now a sticky contents rail beside an always-open index. The rail carries
progress, the part list, and a resume control pointed at the next unread
section, so "where am I and what is next" is answerable at any scroll position.

Below 1024px the rail is not narrowed but re-thought: progress and resume become
a horizontal sticky strip, and the part index becomes a native select, which is
the right control for jumping on a phone.

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
