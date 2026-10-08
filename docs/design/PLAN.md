# RefVault design plan

Scope: audit of the current UI (desktop 1280 and mobile 390, light and dark) and a redesign plan.
No app source was changed. Screenshots: `scratchpad/shots/before`, `before-mobile`, `before-dark`.
Profile: no `.ux-profile.md`, catalog defaults used. Rule names in brackets are the VectorLab skills
(`anti-slop`, `typography`, `spacing`, `colour-palette`, `viewports`, `empty-states`, `loaders`,
`labels`, `verbs`, `errors`, `keyboard`, `icon-buttons`, `surfaces`, `page-patterns`) or `frontend-design` (FD).

---------------------------------------------------------------------------------------------------
## 1. Audit

### 1.1 Cross-cutting (every screen)

P1
- **Thumbnail failure has no fallback.** `ItemCard` and the item player render a bare `<img>`; when it fails the
  browser's broken-image glyph shows in a big grey 16:9 block (seen on Home, Library, Search, Item). [anti-slop, empty-states]
  Fix: `onError` swaps to a designed placeholder (see 2.8).
- **Thumbnails dominate, text is secondary.** Every card spends ~55% of its height on a 16:9 image. The job is
  finding and reading, not browsing posters. A broken or slow image costs the whole card. Library shows 3 per row. [page-patterns: list, visual finish]
- **Sidebar background stops short on long pages** (Home, Item, Links: white panel ends ~860px, page continues below
  on a slate-50 body). Cause: `aside.fixed inset-y-0` is one viewport tall while the page is taller; in a full-page
  capture, and on any browser where the body bg differs from the panel, the seam is visible. Fix: make the shell a
  two-column layout where the sidebar is `sticky top-0 h-dvh` and the page and sidebar share the same `paper` colour,
  separated by a hairline. [colour-palette, viewports]
- **The brand is default Tailwind.** Inter + slate + `#2f6fed` blue + `rounded-xl border shadow-sm` white cards on
  slate-50: this is the SaaS-card kit (FD tell 4). Nothing says "reference library". [anti-slop]
- **Arabic is an afterthought in the type system.** `Noto Sans Arabic` is listed second so it only kicks in per glyph;
  weights and size do not match Inter, so Arabic titles look heavier and larger than English ones on the same row (Home card, Item title)
  and the line-height is tight for Arabic (`leading-snug`). Mixed-direction rows also misalign: on Links the Arabic
  context line is flush right while label and URL are flush left (desktop-links). [typography]

P2
- Type scale is unsystematic: `text-[10px]`, `text-[11px]`, `text-xs` (46 uses), `text-sm`, `text-2xl`. Meta text at 10 to 12px
  carries real information (time, channel, status, counts). Minimum should be 13px. [typography]
- ALL-CAPS tracked labels: `.section-title` (Topics, Collections, "Codes & discounts", "Chapters"), sidebar "CONTENT" / "ORGANIZE", "SOON" badge. [FD, anti-slop]
- Middle-dot meta strings: "Dev Notes · 5m ago", "Postgres Builders · 30:40 · saved 10/7/2026". [FD]
- `timeAgo` is inexact for a library (a video "3d ago" is fine, but "10/7/2026" as a raw locale date is not). Use "7 Oct" for this year.
- Hover lift (`hover:-translate-y-0.5 hover:shadow-md`) on every card and stat tile: decorative motion. [motion]
- Every interactive row is identical white card with the same radius and shadow; there is no hierarchy of surfaces. [colour-palette]
- Native `confirm()` is used for delete item / link / note / topic / collection / disconnect. Item and link
  confirmations do not name the entity ("Remove this link?", "Delete this item..."). [surfaces, errors]
- Icon-only buttons (pencil, trash, plus, x) have `aria-label` but no visible tooltip/title; touch size is `p-1` (about 28px). [icon-buttons, viewports]
- Focus ring is `ring-brand-500` with `ring-offset-white/slate-950`, which is wrong on `sheet` surfaces in dark mode and on the
  blue primary button (blue on blue). [keyboard]
- Dark mode is slate-950/900 blue-black with the same saturated blue; badges (`bg-emerald-950` etc.) are ad hoc per component. [colour-palette]
- Loading is a single centred "Loading…" spinner for every list. No skeletons, no layout stability. [loaders]

P3
- `darkMode: "media"` only; no manual override. Skill pages in this repo expect `[data-theme]`; add a Settings control later (optional).
- `theme-color` is the old blue.
- The `mark` highlight is amber on white, fine, but lowercases nothing; see Library below for a data bug.

### 1.2 App shell (desktop-home, mobile-home)
P1
- Mobile has no persistent nav: hamburger opens a drawer, and the search box is truncated to "Search topics, transcripts, lin" in a
  390px header with a blue "+" next to it. The two primary jobs (find, save) should be one tap and thumb-reachable. [viewports]
- Header is a full-width bar holding a 576px-wide search on a 1000px area: left-aligned, half empty. No `/` shortcut. [keyboard]
P2
- Wikis/Courses "SOON" rows are dim text (`text-slate-400` on white ≈ 2.7:1, fails AA) and look like disabled bugs. [colour-palette]
- "Save a video" is a full-width saturated blue slab at the top of the sidebar: it is the loudest element on every screen, louder than content.
- Sidebar groups use caps labels; "Home" and "Library" and "Videos" are three overlapping entries to the same data.

### 1.3 Home
P1
- Four equal stat cards ("5 Saved items, 1 Being summarized, 8 Links kept, 2 Notes") are the first thing on the page. Counts
  do not help finding anything; they are the "big number + small label" default. [anti-slop]
- Processing items appear **twice** (in "Being summarized"/"Getting transcript" sections and again in "Recently saved"), each as a
  full-size card with a mostly empty body. [page-patterns]
- No search affordance in the body; the page title "Home" and subtitle say nothing. [verbs, empty-states]
P2
- Mobile: section title "Being summarized" and its right-aligned hint "Automatic — ready in a minute or two" collide on one line. [viewports]
- Mobile cards are full-width 16:9 images, about 440px each, so 5 items = 6 screens of scroll. [viewports]

### 1.4 Library / search results
P1
- Search results show a **lowercased** snippet ("building a rag app with postgres and pgvector a hands-on...") that
  concatenates title + summary: the ts_headline source is lowercased/normalised. Show the original-case text. [typography]
  (Data fix: headline from the original columns, not from the tsvector text.)
- Results are a grid of equal cards; there is no indication of *where* the match was (summary, transcript line at 12:40, link, note). For
  a find-it-again tool this is the main information. [page-patterns: list]
P2
- Three native selects in a row (All topics / All collections / Any status) with no labels besides aria-label; "Any status" is
  an internal workflow concept. [labels]
- Title "Results for “postgres”" plus "1 item" is fine; filters have no active-state, and the "Clear filters" ghost button is tiny.
- No result count per source type; no sort.
- Empty state is a bordered card with a 40px grey icon: ok copy, but "Nothing found" has no action. [empty-states]

### 1.5 Item page (most important)
P1
- The 16:9 player is the first and largest thing (about 630x355 on desktop, ~360x200 on mobile) and the summary starts at y≈740.
  The user is here to read the summary, links and mentions; playing is secondary and it can be a sticky side element. [page-patterns: detail]
- Everything is the same `Section` card (Summary, Links, Mentioned, From the description): four identical boxes, same radius/shadow,
  three different icon colours (blue, green, violet, sky) with no meaning. [colour-palette, anti-slop]
- Timestamps, the product's core data, are tiny mono chips (`font-mono`, 11px) floating at the right; links in the Overview
  show no time at all even though `links.timestamp_sec` exists. The video is never connected to what was said when. [typography]
- Mobile: right-rail content (My notes, Topics, Collections) is pushed to the very bottom, below four cards and long chapter lists. Notes
  are a primary feature. [viewports]
P2
- Title row stacks badge + topics chips above the h1 and `Postgres Builders · 30:40 · saved 10/7/2026` below it; "Analyzed" badge is shown
  for the normal state (noise; only show non-normal states). [anti-slop]
- Tabs: Overview / Links 3 / Transcript / Description; "Links" duplicates the Links card in Overview; "Manage" link inside the card. Keep, but the tab bar
  should be a segmented in-page nav that remembers scroll.
- "Open on YouTube" outline button and red "Delete" sit side by side with equal weight; Delete should live in an overflow menu. [surfaces]
- Reading width: summary is a 630px column at 16px sans; fine in width, but sans body with `leading-relaxed` is not the best for a 100-word summary. [typography]
- Arabic item: bullet icons (check-list) sit at the right while the Overview link/mention rows stay LTR; bullets use `ListChecks` icon on every key point (decorative repetition). [anti-slop]
- Transcript lines have 12px grey timestamps at `text-slate-400` (about 2.6:1). [colour-palette]
- Pending state (desktop-item-pending): a card with text; needs a clear progress sentence, not a spinner-less box. [loaders]

### 1.6 Links page
P1
- Rows show favicon-letter tiles in 8 random colours (T, T, G, D, S, H, O, O), blue underlined raw URLs and grey "from: …" lines. The
  label, the URL, the context and the source video all compete at the same size; the thing the user remembers (the *name* and
  the *domain*) is not scannable. The moment in the video (`@ 12:40`) is buried in the "from" line. [typography, page-patterns]
- Arabic context lines are right-aligned while their label/URL are left-aligned in the same row (see desktop-links). [typography]
P2
- Domain chips (twitter.com 1 ...) are an unlabeled filter, no active state visible, tiny counts. "Search" button next to the search field
  with a generic noun label. [verbs, labels]
- One big bordered card holding all rows is right for a list, but there is no sticky header/filter, no grouping by video or domain.

### 1.7 Topics / Collections / Notes / Settings / Login
- Topics (P2): each topic is a card containing a progress bar proportional to count. The bar is decoration (and 1-item topics show
  50% bars); edit/delete icons sit on every card at rest. A tag cloud or a simple list with counts is clearer. [anti-slop, icon-buttons]
- Collections (P2): same card kit; the page is the only way to create one; the empty state needs a create field.
- Notes (P2): list of notes by item; each note is a card; should show the note text first, item title as meta, newest first, and be searchable.
- Settings (P2, 360 lines): sections of cards with caps labels; connector URL copy needs a single copy-affordance; danger area should
  be separated.
- Login (P3): centred white card on slate; brand is just the icon and a name. Use the new identity (wordmark, one-line promise).
- AddVideoDialog (P2): modal for a single-field action. [surfaces: modal where a slide-over/inline was required, <10s]. On mobile make it a bottom sheet;
  on desktop a small popover anchored to the Save button. Keep `/add?url=` share-target behaviour.

### 1.8 Hard gate (profile-less) summary

| # | Check | Result |
|---|---|---|
| 1 | Banned anti-aesthetic list | FAIL: SaaS card kit, caps labels, soft-shadow lift, broken-image blocks |
| 2 | Modal vs slide-over | FAIL: AddVideoDialog is a centred modal for a one-field task |
| 3 | Zero-shift single-field rename | UNPROVEN (link label edit swaps `<p>` for a form: likely shifts) |
| 4 | Destructive confirmations name the entity | FAIL: item, link, note confirms do not name it |
| 5 | Verb-first copy, no blame | MOSTLY: "Search" button, "Back"; fine otherwise |
| 6 | Validation blur/clear | UNPROVEN (forms were not exercised) |
| 7 | Motion tokens / reduced-motion | FAIL: hover translate; no `prefers-reduced-motion` handling in index.css |
| 8 | One locked page pattern | FAIL: Home mixes dashboard + feed; Item mixes detail + dashboard |
| 9 | 375px no overflow, targets | FAIL on targets (many 28px icon buttons); no page overflow seen |
| 10 | Visual finish | FAIL: broken thumbs, primary content at meta size (timestamps, "from"), no fallback |

---------------------------------------------------------------------------------------------------
## 2. Design plan

### 2.0 Direction in one paragraph
RefVault is a **reference catalogue for spoken sources**. The thing that makes it different from a notes app is that every fact
points to a *moment*. The design treats the timestamp as a **locator**, the way a book citation treats a page number, and spends
all its boldness on one device: the **locator tab** and the **timeline strip** built from it. Everything else is quiet: flat
paper surfaces, hairlines instead of shadows, one serif for reading, one humanist sans for UI, a single binding-green accent.

### 2.1 Colour (named tokens, CSS variables, Tailwind maps to them)

Neutrals are green-grey (not cream, not slate-blue). One accent. One highlighter colour used only for locators and search marks.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F2F4F1` | `#12181B` | page background (also the sidebar) |
| `sheet` | `#FFFFFF` | `#1A2226` | raised content: item header, inputs, popovers (never cards by default) |
| `ink` | `#16202A` | `#E7EDE9` | text |
| `ink-2` | `#4B5863` | `#A2B0B8` | secondary text. 7.0:1 on paper light, 7.4:1 on paper dark |
| `line` | `#D8DEDA` | `#2A353B` | hairlines, input borders |
| `binding` (accent) | `#17665A` | `#74CDB4` | links, active nav, primary button bg (light), focus ring |
| `binding-wash` | `#E1EFEA` | `#1C2F2C` | active nav row, selected chips |
| `marker` | `#FFDF6B` (text `#2A2100`) | `#E5BF3F` (text `#1E1800`) | locator tabs, search `mark`, nothing else |
| `danger` | `#B3261E` | `#F28B82` | destructive text |
| `warn` | `#8A5A00` on `#FBEFD0` | `#F0C36A` on `#33280F` | pending states |

Contrast: `binding` on `paper` light 5.9:1, on `sheet` 6.4:1; primary button white on `binding` 6.4:1; dark primary button
`#0B1513` text on `#74CDB4` 9.9:1. Estimated 60-30-10: 60 `paper`, 30 `sheet`+`ink`, 10 `binding` and `marker` combined (marker under 3%).
Elevation order: border first (`line`), then shadow only on floating layers (popover, sheet, drawer): `0 8px 24px rgb(16 32 42 / .12)`.
Dark mode elevates by lighter surface (`paper` < `sheet` < popover `#222D32`), never by shadow.

### 2.2 Type

Two families, clearly different, both with matched Arabic.

| Role | Latin | Arabic (in the same font stack) | Notes |
|---|---|---|---|
| Reading and titles | **Source Serif 4** (opsz variable, 400/600) | **Noto Naskh Arabic** (400/600) | item title, summaries, key points, notes, Home headline |
| UI and data | **IBM Plex Sans** (400/500/600) | **IBM Plex Sans Arabic** (400/500/600) | nav, labels, buttons, meta, timestamps (`tabular-nums`) |

Tailwind: `font-serif: ["Source Serif 4","Noto Naskh Arabic","Georgia","serif"]`, `font-sans: ["IBM Plex Sans","IBM Plex Sans Arabic","system-ui","sans-serif"]`.
Because the Latin font is first, English renders in it and Arabic glyphs fall through to the Arabic family: no `lang` hacks. No monospace anywhere.
Arabic metrics: Naskh and Plex Arabic read about 8% smaller than Latin at the same px; add `[dir=rtl] / :lang(ar)` rule via `unicode-range` is not
needed; instead use `.ar-boost` = `font-size-adjust: 0.5` fallback and `line-height` +0.1 for `[dir="rtl"]` text (rule in index.css, see B/A5).

Scale (rem, 16px base) and line height. Minimum 13px.

| Token | Size / line | Weight, family | Use |
|---|---|---|---|
| `text-display` | 34 / 40 | serif 600 | Home headline, Login |
| `text-title` | 28 / 34 (mobile 24 / 30) | serif 600 | item title, page titles |
| `text-h2` | 20 / 28 | serif 600 | section heads on item page |
| `text-lead` | 18 / 30 (serif 400) | serif | summary paragraph. Arabic 19 / 34 |
| `text-body` | 16 / 24 | sans 400 | UI body, lists |
| `text-read` | 17 / 28 | serif 400 | notes, key points |
| `text-meta` | 14 / 20 | sans 400, `ink-2` | channel, date, context |
| `text-small` | 13 / 18 | sans 500 | locator tabs, counts, chips |

Weights used: 400, 500, 600 only. Line length: `max-w-[68ch]` for prose, lists may run to 880px.
Sentence case everywhere. Section labels are sentence-case 14px sans 600 `ink-2`, never caps, never tracked.

### 2.3 Shape, spacing, motion
- Spacing: 4pt grid, page gutter 16 (mobile) / 32 (desktop), section gap 40, row padding 12 x 16.
- Radius by role (not one radius): 4px locator tabs and chips, 8px inputs and buttons, 12px only for the video frame and floating layers. No radius on list rows.
- Structure from hairlines (`line`), not boxes. A list is rows divided by 1px lines on `paper`; only the **item header** and popovers sit on `sheet`.
- Motion: one orchestrated moment (2.9), 120ms colour/opacity transitions on hover/focus, 200ms sheet/drawer transform. Everything under
  `@media (prefers-reduced-motion: reduce)` becomes opacity-only or instant.
- Focus: `outline: 2px solid binding; outline-offset: 2px` on every focusable; on `binding` buttons offset white ring.

### 2.4 The one memorable element: the locator tab and timeline strip
Every reference in RefVault has a moment. We render it as a **locator tab**: a small `marker`-yellow tab (4px radius, 13px sans 600,
tabular-nums, `ink` text) like a highlighter-marked page number: `12:40`. It is the *only* yellow in the product (plus search `mark`).
It is always a button that seeks the video (`aria-label="Play from 12:40"`).

- Used in: Links rows, "Mentioned" rows, chapters, transcript lines, search result "found at" lines, notes (optional).
- **Timeline strip** (item page): a 10px-tall ruler directly under the video, full width of the player. Chapters are segments
  separated by 2px gaps (segment title in tooltip), links and mentions are `marker` ticks (links = tall tick, mentions = short tick),
  the playhead is `binding`. Hover/focus a tick shows the label ("pgvector GitHub repo, 12:40"), click seeks. No video duration
  = strip hidden. This is the single visual signature: the reference note is a map of the video.
- Where there is no timestamp (`timestamp_sec` null) the tab is omitted, not replaced by a dash.

### 2.5 App shell

Desktop (>= 1024): two columns, sidebar 232px on `paper`, 1px `line` right border, `sticky top-0 h-dvh`, scrolls itself if short.
No header bar: search lives at the top of the main column as the page's first element (sticky on scroll, 56px).

```
+----------------+-----------------------------------------------------------+
| RefVault       |  [ Search your library...                    /  ] [Save]  |  sticky 56px
|                |-----------------------------------------------------------|
| Home           |                                                           |
| Library        |   page content (max 880px for lists, 1120 for item page)  |
|                |                                                           |
| Videos         |                                                           |
| Wikis    soon  |                                                           |
| Courses  soon  |                                                           |
|                |                                                           |
| Links          |                                                           |
| Topics         |                                                           |
| Collections    |                                                           |
| Notes          |                                                           |
|                |                                                           |
| Settings       |                                                           |
+----------------+-----------------------------------------------------------+
```
- Wordmark: "RefVault" set in Source Serif 4 600, 20px, with a small inline mark (a bookmark glyph with a notch; replaces blue tile). No tile.
- Groups separated by 24px gaps, no caps labels. Order: Home, Library | Videos, Wikis, Courses | Links, Topics, Collections, Notes | Settings (bottom).
- Active row: `binding-wash` bg, `binding` text, 2px `binding` bar on the start edge (logical `border-s-2`). Inactive `ink-2`.
- "Wikis / Courses": `ink-2` at 70% text with the word "soon" as plain 13px text (not a pill); `aria-disabled`, not links. Still >= 4.5:1 (use `ink-2`, not opacity).
- Save: a **secondary-weight** button at the right of the search row ("Save video", `binding` bg, 36px). Not a slab in the sidebar. `n` is a shortcut.
- Search: `/` focuses it; placeholder "Search videos, links, transcripts, notes" (Arabic works as typed); `<kbd>/</kbd>` hint at the end on desktop; Esc clears.

Mobile (< 1024): no hamburger as primary nav. Bottom tab bar (56px + safe-area), top bar only shows page title and a search icon.

```
+--------------------------------+
| Library                  [ ⌕ ] |  top: 48px, title serif 20, search icon -> full-width search overlay
|--------------------------------|
|                                |
|   content, 16px gutters        |
|                                |
|--------------------------------|
|  Home  Library  [+ Save]  Links  More |  bottom bar, 5 slots, labels 13px
+--------------------------------+
```
- Slots: Home, Library, Save (centre, `binding` filled, opens bottom sheet), Links, More. "More" opens a sheet listing Videos, Topics, Collections, Notes, Settings (+ soon items).
- Targets >= 44px. Active tab: `binding` icon + text, no pill.
- Search overlay: full-screen sheet with the field focused, recent searches, then results navigate to `/library?q=`.
- Save sheet: bottom sheet, one input (autofocus, `inputmode=url`), pastes clipboard URL suggestion, primary "Save video". Used for `/add?url=` too.

### 2.6 Home (page pattern: feed with one search hero)
Content is a *start page for finding*, not stats. Alignment: left.

```
Desktop (main column 880px)
+---------------------------------------------------------------+
|  What are you trying to find?                  <- display serif  |
|  [ Search videos, links, transcripts, notes...            ]   |  large field 52px, same /library?q= behaviour
|  Topics:  AI   Databases   Creativity   Education   all topics  |  text links, 5 most used
|---------------------------------------------------------------|
|  Still processing (2)                                          |  only if any; slim rows, no thumbs
|   Supabase Edge Functions in 100 seconds      Getting transcript |
|   The best note-taking workflow for developers  Summarizing      |
|---------------------------------------------------------------|
|  Recently saved                                    See library  |
|   [thumb] Building a RAG app with Postgres and pgvector        |
|           Postgres Builders, 30:40, yesterday                  |
|           A hands-on walkthrough of retrieval-augmented...     |
|   ----------------------------------------------------------- |
|   [thumb] شرح الذكاء الاصطناعي للمبتدئين: كيف تعمل النماذج     |
|  ...                                                           |
|---------------------------------------------------------------|
|  Latest links                                      See all links|
|   pgvector GitHub repo   github.com   12:40   from Building... |
+---------------------------------------------------------------+
```
- Replace the 4 stat cards with one line in `text-meta`: "5 videos, 8 links, 2 notes" under the headline only when the library has content; counts link to the pages.
- Processing items live only in the "Still processing" strip (removed from Recently saved until analyzed). Copy: row-level status text, e.g. "Getting transcript, usually under a minute".
- Empty library: headline stays; below the field a single paragraph "Save your first video: paste a YouTube link or share one from your phone" with the Save button. No illustration.

### 2.7 Library and search results (page pattern: list)
Rows, not cards. Row = thumbnail 128x72 (start side), text column, end side empty. 16px vertical padding, hairline between.

```
Library                                   1 result
[ Topic v ] [ Collection v ] [ Done v ]    clear filters
--------------------------------------------------------------
[128x72]  Building a RAG app with Postgres and pgvector        (serif 600 18/26, 2 lines max)
          Postgres Builders, 30:40, yesterday                   (meta 14, ink-2; separators are spaces/commas)
          ... walkthrough of retrieval-augmented generation using only [Postgres]: embeddings ...   (mark)
          [12:40] in transcript: "...hybrid search with Postgres full-text..."    <- when q: best match + locator tab
          AI  Databases                                          (chips 13px, 4px radius, binding-wash)
--------------------------------------------------------------
```
- Filters: three labelled selects become a single "Filter" row of `sheet` buttons that open popovers (desktop) or a bottom sheet (mobile); active filters show as removable chips ("Topic: AI x"). Status filter renamed "Progress": All, Done, Processing.
- When `q` is set, each row shows *where* it matched: a line labelled by plain words ("In summary", "In transcript at 12:40", "In link: pgvector GitHub repo", "In your note") with the locator tab if the match has a time. This needs the search RPC to return `match_kind` and `match_sec` (optional; degrade to the current snippet).
- Mobile: thumbnail 96x54, text beside it, chips on a second line; row min-height 88; the whole row is the tap target.
- Skeleton: 6 rows with grey 128x72 block + 3 lines (>1s). Under 1s no loader (render stale list).
- Empty search: "No match for “postgres”. Search covers titles, summaries, transcripts, links and notes. Try one word, or [clear filters]."
- "Load more" stays; add "Showing 30 of 64".

### 2.8 Thumbnail and fallback
- Component `Thumb`: `<img onError>` sets `failed`; fallback is a `line`-bordered `binding-wash` block with the channel's first letter or first title letter (serif 600 24px; Arabic letter works) and, for pending, nothing else. Sized by parent. Never a broken icon. `loading="lazy"`, explicit `width/height`, `alt=""` (decorative; the title is adjacent).
- Duration shown bottom-end as a 13px `sheet` chip on the thumb.

### 2.9 Item page (page pattern: detail with sticky side rail)
**Owner decision: item page has NO tabs — one continuous scrolling page (summary → links → mentions → chapters/description → transcript → notes) with a sticky in-page contents bar of anchor links.** (Overrides the tab wording in this section and in C3, C8, C9.)

The reading comes first; the video is a sticky companion.

```
Desktop 1120px: main 680px | gap 48 | rail 392px (sticky top 72)

+-------------------------------------------+   +-----------------------------+
| < Library                                 |   | [ video 392x221 ]           |
|                                           |   | [====|==x=====|=x==|==]     |  <- timeline strip (locator ticks)
| Building a RAG app with Postgres          |   | Open on YouTube      ...    |
| and pgvector                  (title serif)|   |-----------------------------|
| Postgres Builders, 30:40, saved 7 Oct     |   | My notes                    |
| AI  Databases   + Add topic               |   |  [ textarea, serif 17 ]     |
|-------------------------------------------|   |  Saved                      |
| Summary | Links 3 | Transcript | Details  |   |-----------------------------|
|-------------------------------------------|   | Collections                 |
| A hands-on walkthrough of retrieval-      |   |  [x] RAG project            |
| augmented generation using only Postgres  |   +-----------------------------+
| ... (lead 18/30, 68ch)                    |
|                                           |
| Key points                                |
|  - Use HNSW indexes for fast approximate  |
|  - Combine vector and full-text scores    |
|                                           |
| Links                                     |
|  Slides               docs.google.com     |
|  pgvector GitHub repo github.com  [12:40] |
|  Supabase AI guide    supabase.com [12:40]|
|                                           |
| Said in the video                         |
|  [3:20]  pgvector   tool                  |
|          Vector similarity for Postgres   |
|  [21:40] Reciprocal Rank Fusion   paper   |
|                                           |
| Chapters                                  |
|  [0:00] Intro   [3:10] Embeddings ...     |
+-------------------------------------------+
```
- Header (not a card): back link, title (serif title, `dir=auto`, up to 3 lines), one meta line in `text-meta` with `bdi` channel, length and "saved 7 Oct", then topics as chips with an inline "Add topic" (a chip-shaped input that expands). Status only when not done: a `warn` bar "Summarizing. This page fills in by itself, usually within two minutes." with a 2px indeterminate bar (opacity pulse, reduced-motion: static).
- Tabs become sticky in-page navigation (Summary, Links, Transcript, Details) under the header; on desktop the Summary tab shows the whole overview above (Summary, Key points, Links, Said in the video, Chapters) as one continuous column separated by 40px gaps and hairlines, **not** as separate boxes. Other tabs keep their current content.
- Section heads: serif 20px 600 sentence case, no icons, no colour. Counts as plain text after ("Links, 3" is avoided; write "Links" and put the count in the tab).
- Key points: serif 17px list with plain discs (`binding` colour), no check-icons. Arabic: `list-style-position: inside` is not used; use logical `ps-5` so bullets flip.
- Links in Overview: show label (500), domain (`ink-2`), locator tab at the end; whole row opens the link in a new tab; locator tab seeks the video instead (stopPropagation). Rows 48px.
- "Said in the video": locator tab first (start edge), name, kind as plain 13px `ink-2` text after the name, context under it.
- Desktop rail: sticky; contains player, timeline strip, notes, collections. Mobile: rail is not at the bottom; order is header, **video collapses to a 16:9 frame with the strip**, tabs, content, then notes as its own tab-less section with a sticky "Add note" button at the bottom of the viewport. Video on mobile is not sticky (it wastes the viewport); tapping a locator tab scrolls to the top frame and plays.
- Actions: "Open on YouTube" (text button with icon in rail), and a `...` overflow menu with "Delete video". Delete confirm is a small dialog: title `Delete “Building a RAG app with Postgres and pgvector”?`, body "Its links, notes and transcript are deleted too. This can't be undone.", buttons "Cancel", "Delete video" (danger).
- Pending state: header and tabs visible; Summary area shows 3 skeleton lines, Links area shows "Links appear when the summary finishes", Transcript tab shows the retry/paste panel (kept).
- Error state: `ErrorBox` becomes a `danger` bordered row: "Couldn't get this transcript (captions are off). Paste it in or try again." with two buttons.

### 2.10 Links page (page pattern: list, the main finder)
```
Links                                                 8 links
[ Search links by name, site or context...  ]   Site: All v   Sort: Newest v
---------------------------------------------------------------------------
pgvector GitHub repo                                              [12:40]
github.com   Code for the demo                                   (meta)
From Building a RAG app with Postgres and pgvector
---------------------------------------------------------------------------
Hugging Face                                                      [10:10]
huggingface.co   مكتبة النماذج المفتوحة
From شرح الذكاء الاصطناعي للمبتدئين...
```
- Row: label (sans 500 17px), then domain in `binding` (not the full URL; full URL in the `title` and on copy), context, then "From <video title>" link. Row `dir` taken from the label/context script with logical alignment so Arabic rows mirror *as a whole* (tab goes to the opposite edge), fixing the mixed alignment.
- Favicon tiles removed (random colours). Use the real favicon if available through `SiteIcon`, else no icon; icon is 16px neutral.
- Locator tab links to the video at that moment (`/item/:id?t=760`); the row itself opens the URL.
- Row actions (copy URL, open) appear at rest as two 44px icon buttons on mobile, on hover/focus on desktop, each with a tooltip.
- Site filter is a combo (select on mobile, popover list with counts on desktop), replacing the chip row.
- Empty: "No links yet. Links in video descriptions and the ones said out loud are collected here after you save a video." with button "Save a video".

### 2.11 Principles
1. Findability beats browsing: search is the hero on Home; every list shows *why* a row matched.
2. A fact without a moment is half a fact: the locator tab is the one memorable thing and the only yellow.
3. Structure from hairlines and type, not boxes: lists on paper, one raised sheet per screen at most.
4. Read in serif, operate in sans; Arabic is first-class (same sizes optically, logical CSS properties everywhere, `dir=auto` per text node and per row).
5. Quiet by default: the interface speaks only when something is pending, failed or destructive.
6. Phone-first thumbs: bottom bar, sheets, 44px targets; desktop adds a sticky rail, not more chrome.

---------------------------------------------------------------------------------------------------
## 3. Plan review (what was revised and why)

First draft, and what changed after checking it against the brief and the FD tells:
1. **Palette.** Draft 1: cream paper `#F6F1E7` + deep oxblood `#7A2E2E` accent ("library binding"). That is the cream + warm-clay cluster (tell 1) and a cliché for "books". Revised to a green-grey paper `#F2F4F1` with a cool binding green; the warm colour is reserved for the highlighter yellow, used only on locators.
2. **Dark mode.** Draft 1: near-black `#0B0B0B` with a lime accent (tell 2). Revised to a lifted blue-green charcoal `#12181B` (tinted, 14 L-step above black) with a soft mint accent `#74CDB4` at 9.9:1 on buttons, no neon.
3. **Layout.** Draft 1 kept a thumbnail grid with nicer cards (tell 4: identical rounded cards, soft shadow) and a Home of stat tiles. Revised: rows on hairlines, thumbnails shrink to 128px, Home becomes a search-first start page with no stat tiles; counts are a sentence.
4. **Typography.** Draft 1 proposed Fraunces for headings (a common "editorial" pick) and Inter for UI. Revised to Source Serif 4 for reading and IBM Plex Sans for UI because both have matching Arabic families with similar proportions (Noto Naskh Arabic, IBM Plex Sans Arabic) and the serif is chosen for long-form summaries in two scripts, not for style. No mono; timestamps use tabular figures.
5. **Chrome.** Draft 1 kept caps section labels in a smaller, tracked style ("CONTENT"), dot-joined meta ("Channel · 5m ago") and a "->" on "See library". All removed: group spacing replaces labels, meta is separated by spaces or commas with the channel in its own line, links are plain text.
6. **Memorable element.** Draft 1 had three ideas (a big wordmark, a gradient hero and a timeline). Cut to one: the locator tab + timeline strip, because it encodes real data (`timestamp_sec`, `duration_sec`, chapters) instead of decorating.
7. **Item page.** Draft 1 kept four coloured section cards with icons. Revised to one continuous reading column with serif section heads, since the colour-coded icons carried no meaning and duplicated the tabs.
8. **Motion.** Draft 1 had staggered card fade-in on Home. Cut: only the processing bar (state change) and sheet transitions (user action) animate.
9. **Sidebar bug.** Draft 1 only added a background colour to the sidebar; revised to a structural fix (sticky `h-dvh` column sharing the page colour).

---------------------------------------------------------------------------------------------------
## 4. Implementation spec

Order matters: A first (nothing visible changes except fonts/colours), then B, C, D. Run `npm run build` and the screenshot script after each group (light, dark, desktop, mobile).
Rules for all steps: use logical utilities (`ps-`, `pe-`, `ms-`, `me-`, `text-start`, `border-s`) instead of `pl/pr/ml/mr/text-left`; keep every route and handler; sentence case; verb-first buttons.

### A. Foundation
A1. **Fonts** (`index.html`): replace the Google Fonts link with
`family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Noto+Naskh+Arabic:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap`.
Keep the preconnects. Update `<meta name="theme-color">` to `#F2F4F1` plus a dark media variant `#12181B`. CSP already allows Google Fonts.
A2. **Tokens** (`src/index.css`): define `:root{ --paper:242 244 241; --sheet:255 255 255; --ink:22 32 42; --ink-2:75 88 99; --line:216 222 218; --binding:23 102 90; --binding-wash:225 239 234; --marker:255 223 107; --marker-ink:42 33 0; --danger:179 38 30; --warn-bg:251 239 208; --warn-ink:138 90 0; }`
and `@media (prefers-color-scheme: dark){ :root{ ...dark values from 2.1... } }` (space-separated RGB so Tailwind opacity works). Keep `darkMode: "media"`; if a manual theme is wanted later, add `:root[data-theme="dark"]` with the same block.
A3. **Tailwind** (`tailwind.config.js`): `colors: { paper:"rgb(var(--paper) / <alpha-value>)", sheet, ink, "ink-2", line, binding, "binding-wash", marker, "marker-ink", danger, "warn-bg", "warn-ink" }`; remove `brand`. `fontFamily: { serif:[...], sans:[...] }` (2.2). `fontSize` entries `display, title, h2, lead, read, meta, small` with line-heights from 2.2. `borderRadius: { tab:"4px", ctl:"8px", frame:"12px" }`. `boxShadow: { float:"0 8px 24px rgb(16 32 42 / .12)" }` and drop `shadow-sm` use on rows. `maxWidth: { prose:"68ch", list:"880px", item:"1120px" }`. Add `screens` unchanged.
A4. **Base styles** (`index.css @layer base`): `body{ @apply bg-paper text-ink font-sans antialiased; }`; `h1,h2,h3{ @apply font-serif; }`; `:focus-visible{ outline:2px solid rgb(var(--binding)); outline-offset:2px }`; `[dir="rtl"], :lang(ar){ line-height:1.9 }`; `@media (prefers-reduced-motion:reduce){ *{ animation-duration:.01ms !important; transition-duration:.01ms !important } }`; `font-variant-numeric: tabular-nums` on `.num`.
A5. **Component classes** (`@layer components`, replace old ones; keep class *names* `btn`, `btn-primary`, `btn-ghost`, `btn-outline`, `btn-danger`, `input`, `chip` so pages keep working, then migrate away from `card`):
- `.btn` 40px min height (44px at `<sm`), `rounded-ctl`, `text-body font-medium`, `transition-colors duration-100`.
- `.btn-primary` bg `binding`, text `#fff` (dark: bg `binding`, text `#0B1513`); hover darken 8% via `hover:brightness-95`.
- `.btn-outline` 1px `line`, `bg-sheet`. `.btn-ghost` text `ink-2` hover `bg-binding-wash`. `.btn-danger` text `danger`, hover `bg-danger/10`.
- `.input` `bg-sheet`, `border-line`, `rounded-ctl`, 44px mobile, focus ring via global rule; `placeholder:text-ink-2/70`.
- `.chip` `rounded-tab bg-binding-wash text-ink text-small px-2 py-0.5` (links use `hover:underline`).
- `.row` (new): `border-b border-line py-4` for list rows; `.sheet` (new): `bg-sheet border border-line rounded-frame`.
- `.locator` (new): `inline-flex items-center rounded-tab bg-marker text-marker-ink text-small font-semibold px-1.5 min-h-[24px] num` and an enlarged hit area via `relative before:absolute before:-inset-2` (reaches 44px touch).
- `.section-title` is deleted; replace usages with `h2.text-h2` or `p.text-meta font-semibold`.
- `mark` → `bg-marker/60 text-inherit rounded-tab px-0.5`.
- Delete `.card`; replace in each file as listed in B to D (grep `card` after).
A6. **Shared UI** (`src/components/ui.tsx`, new files in `src/components/`):
- `Thumb.tsx` (2.8) with `onError` fallback and optional duration chip.
- `Locator.tsx` `<Locator sec onSeek|href />` renders `.locator` button/link with `formatTimestamp` (move `formatTimestamp` out of ItemPage into `src/lib/format.ts` together with `formatDate`: "7 Oct", "7 Oct 2025" if another year; `timeAgo` kept for "just now/Xm/Xh" under 24h then `formatDate`).
- `Skeleton.tsx` (`SkeletonRows n`) using `bg-line` blocks with a 1.4s opacity pulse (static under reduced motion). Replace `Spinner` usage in lists; `Spinner` stays for inline (<1s) actions.
- `EmptyState`: drop the `.card` and big icon; render `title` (serif h2), a sentence, and an optional action `ReactNode`. Add `action` prop.
- `ErrorBox`: `border-s-4 border-danger bg-danger/10`, message + optional `onRetry` ("Try again").
- `StatusBadge` → `StatusNote`: plain text with a 6px dot (`warn-ink`), copy: transcript_pending "Getting transcript", fetched "Summarizing", error "Needs attention". Remove the "analyzed" badge entirely (done is the default).
- `PageHeader`: title `text-title font-serif`, optional `meta` line, `actions` right; margin-bottom 24.
- `Menu.tsx` (small popover with `role=menu`, Esc closes, focus restore) and `ConfirmDialog.tsx` (replaces `window.confirm`, takes `title`, `body`, `confirmLabel`, `danger`); `Sheet.tsx` (bottom sheet on mobile, centred 440px dialog on desktop, focus trap + restore, `aria-modal`). Use for Save, filters, delete.
- `Tooltip` via the `title` attribute plus `aria-label` for all icon buttons (min size 44 mobile / 32 desktop) through a `IconButton` component.
A7. **Keyboard**: global `/` focuses search, `n` opens Save, Esc closes sheets (in `AppShell`). Do not fire when typing in inputs.

### B. App shell, Home, Library, cards
**Owner change to B6:** the Home hero is ONE smart input (label "Paste a YouTube link or search your library"): a YouTube link turns the button into "Save video" (POST /ingest, then navigate to /item/:id); anything else is "Search" (-> /library?q=). Implemented in `Home.tsx` `SmartInput`.

B1. `src/layout/AppShell.tsx`: rewrite the structure to `div.grid.lg:grid-cols-[232px_1fr] min-h-dvh`; `aside` = `hidden lg:flex sticky top-0 h-dvh flex-col border-e border-line bg-paper overflow-y-auto`. Remove `fixed`, `lg:pl-64`, and the white backgrounds.
B2. Sidebar: wordmark (serif 600, 20px) + inline SVG bookmark mark (replace `/icon.svg` image in the shell only; keep the file for PWA). Nav groups from `MAIN_NAV`, `MODULES`, `ORGANIZE_NAV` rendered with 24px gaps and no group labels (delete `section-title` paragraphs, "Content", "Organize"). `NavItem` classes: `flex items-center gap-3 ps-3 pe-3 h-10 rounded-ctl text-body`, active `bg-binding-wash text-binding font-medium border-s-2 border-binding`, inactive `text-ink-2 hover:bg-binding-wash/60`. Disabled modules: `<span aria-disabled>` with text "Wikis" and trailing plain "soon" in `text-small text-ink-2`.
B3. Top area: replace `<header>` with a sticky 56px row inside `main`: `SearchBox` (max-w-list, placeholder "Search videos, links, transcripts, notes", `<kbd>/</kbd>` hint hidden on touch) + `Save video` primary button (hidden `<lg`). Remove backdrop-blur and the white bar.
B4. Mobile: add `BottomBar` (`lg:hidden fixed inset-x-0 bottom-0 h-14 pb-[env(safe-area-inset-bottom)] bg-paper border-t border-line`) with NavLinks Home, Library, centre Save (opens `Sheet`), Links, More (opens `Sheet` with the remaining nav). Add `pb-20` to `main` on mobile. Replace the drawer and hamburger. Top bar on mobile: page title (from route) and a search icon button that opens a full-screen search sheet (same `SearchBox`).
B5. `AddVideoDialog.tsx` → render inside `Sheet`; label "Video link" (visible label, placeholder only `https://youtube.com/watch?v=…`); button "Save video"; success toast copy "Saved. Details fill in over the next minute." Keep `/add` route/query handling and `initialText`.
B6. `src/pages/Home.tsx`: remove `Stat` and the 4-card grid; add hero (`h1.text-display` "What are you trying to find?", large search input that navigates to `/library?q=`, top-5 topics as text links from `listTopics`, line "5 videos, 8 links, 2 notes" as links). Sections: "Still processing" (only if `pending + noTranscript` > 0, slim `ProcessingRow`s: title, channel, status note, no thumb), "Recently saved" (filter out non-analyzed; 6 `ItemRow`s), "Latest links" (5 rows from the links query, reuse `LinkRow` compact). Section heads `text-h2`; "See library" plain text link (no arrow). Empty state per 2.6.
B7. `src/components/ItemCard.tsx` → `ItemRow` (keep file or rename and update imports in Home/Library/Collections): `Link` as flex row `row`, `Thumb` 128x72 (96x54 mobile), title `font-serif text-lg font-semibold line-clamp-2 dir=auto`, meta `text-meta` as `<bdi>channel</bdi> , <span>duration</span> , <time>date</time>` written as "Postgres Builders, 30:40, yesterday" (no middle dots), snippet/summary `text-meta line-clamp-2 dir=auto`, when `showSnippet` add match line with `Locator` if `match_sec` present (fallback to snippet), chips max 3 + "+2". Remove `hover:-translate-y`, shadows; hover = `bg-sheet/60`.
B8. `src/pages/Library.tsx`: `PageHeader` title unchanged but subtitle becomes "{n} videos" (module label aware); replace the three `select`s with a `FilterBar` (buttons: Topic, Collection, Progress open `Menu`s; active ones show as removable chips; keep URL params `tag`, `collection`, `status`; rename status labels: "Done", "Summarizing", "Getting transcript"); empty state with action "Clear filters"; skeleton rows; "Load more" → "Show 30 more". Fix lowercase snippet in the search function (`supabase/` SQL: build `ts_headline` from `coalesce(summary,'')` / original title text, not the lowercased concat) and, optionally, return `match_kind`, `match_sec`.
B9. `Highlight` stays (`[[ ]]` parsing); `mark` style from A5.

### C. Item page (`src/pages/ItemPage.tsx`, 703 lines; split sub-components into `src/components/item/*` while keeping behaviour)
**Owner decision: item page has NO tabs — one continuous scrolling page (summary → links → mentions → chapters/description → transcript → notes) with a sticky in-page contents bar of anchor links.**
C1. Layout: `grid lg:grid-cols-[minmax(0,680px)_392px] gap-12 max-w-item mx-auto`. Right rail `lg:sticky lg:top-20 self-start space-y-8`: `PlayerBox` (video frame `rounded-frame overflow-hidden`, keep `playerRef` and the YouTube IFrame API setup untouched), `TimelineStrip`, "Open on YouTube", `NotesBox`, `CollectionsBox`. On `<lg`, order via CSS `order`: header, player+strip, tabs/content, notes, collections.
C2. `TimelineStrip.tsx`: props `duration` (from `video.duration_sec`), `chapters` (existing parsed chapters), `links` (with `timestamp_sec`), `mentions` (with timestamp field), `onSeek`. Render `div[role=group][aria-label="Timeline"]` 10px tall, segments `bg-line`, ticks `.bg-marker` (links 14px tall, mentions 8px), buttons positioned with `left: pct%` (use `inset-inline-start` for RTL-safe, but the timeline direction stays LTR: set `dir="ltr"` on the strip). Each tick is a `<button>` with `aria-label="Play from 12:40, pgvector GitHub repo"` and a 24px hit area; tooltip on hover/focus. Hidden when no duration or no markers.
C3. Header block (replace badges + h1 stack): back link ("Library" with arrow icon, uses `navigate(-1)`), `h1.text-title font-serif dir=auto`, meta line (no dots), topics chips with inline add (move `TopicsBox` input into an expandable chip; keep `removeTopic`/`addTopic` calls), status bar for `fetched`/`transcript_pending` ("Summarizing. This page fills in by itself, usually within two minutes."; `role=status`), no "Analyzed" badge.
C4. Overview column: delete `Section` boxes. Create `Block` = `section` with `h2.text-h2` and `mt-10 border-t border-line pt-8` for all but the first. Summary: `p.text-lead.font-serif max-w-prose whitespace-pre-line dir=auto`; key points: `ul.list-disc ps-5 marker:text-binding space-y-2 text-read font-serif`; remove `ListChecks`. Edit summary: icon button "Edit summary" (text "Edit" is fine) toggles in-place editor; keep textarea behaviour but keep the same height as the rendered block (`min-h` match) to avoid shifting.
C5. Links block: reuse the new `LinkRow` (from D1) in compact mode with `Locator` for `timestamp_sec`; heading "Links" and a "Manage links" text button that switches to the Links tab (keep `setTab`). Remove the `Manage` link inside the card style.
C6. "Said in the video" → heading "Mentioned in the video" kept (copy fine) as `ul.divide-y divide-line`; each `li`: `Locator` (when time) at start, name `font-medium` (link if `url`), kind as `text-meta capitalize` after the name (not a chip), context below `text-meta`.
C7. Chapters block: list of `Locator` + title (replace the mono clocks); "From the description" → heading "From the description", subheads "Codes and discounts", "Chapters" as `text-meta font-semibold` (no caps).
C8. Tabs: sticky (`sticky top-14 bg-paper z-10`), `role=tablist` kept, tab buttons `h-11 px-3 text-body`, active `text-ink border-b-2 border-binding`, inactive `text-ink-2`; counts as `text-small text-ink-2` ("Links 3"). Persist selected tab in URL hash (`#links`), so back-navigation keeps it.
C9. Transcript tab: each line `grid grid-cols-[56px_1fr] gap-3 py-1.5 text-read`; timestamp rendered as `Locator`-lite (no yellow, `text-ink-2` underline on hover) to avoid a wall of yellow; the currently-playing line `bg-binding-wash`. Search field "Find in transcript" with count; keep Copy transcript. Retry/paste panel restyled with `.sheet`; button copy "Try again", "Save pasted transcript".
C10. Notes (`NotesBox`): textarea `font-serif text-read`, autosave status text ("Saved", "Saving", "Not saved. Retry") `text-small` visible at rest; delete note via `ConfirmDialog` titled `Delete this note?` showing its first 60 characters.
C11. Delete item: move to overflow `Menu` ("Delete video") next to "Open on YouTube"; `ConfirmDialog` names the title (2.9). Same for link delete: `Remove “{label}” from this video?`, button "Remove link".
C12. Link label edit (`LinkRow` in LinksTab): edit in place with `min-h` fixed, replacing the label text with an input of the same line box; Enter saves, Esc cancels; no layout shift.
C13. Arabic: root of title/summary/key points/mentions keeps `dir="auto"`; apply `text-start`; add `lang` unnecessary. Check `list-disc ps-5` mirrors. Timeline strip stays `dir=ltr`.

### D. Links / Topics / Collections / Notes / Settings / Login + states
D1. `src/pages/Links.tsx`: implement 2.10. Create `LinkRow` (shared with ItemPage): label, `domain` in `text-binding`, context, "From {title}" link to `/item/:id?t=sec`, `Locator`, actions (`Copy link`, `Open`) with `IconButton`s. Use `dir` from `/[؀-ۿ]/.test(label+context)` to set row `dir="rtl"`. Search field gets a visible label via `aria-label` + placeholder "Search by name, site or context"; submit on type (debounce 250ms) so the "Search" button is removed. Domain chips → `Site` select/menu with counts.
D2. `ItemPage` reads `?t=` on load to seek once the player is ready.
D3. `src/pages/Topics.tsx`: replace card grid + bars with a two-column list (one column on mobile): topic name (serif 18), count in `text-meta`, whole row links to `/library?tag=`; rename/delete via `IconButton`s that show on hover/focus on desktop and in a `...` menu on mobile. Delete uses `ConfirmDialog` ("Delete topic “AI”? 2 videos keep everything else."). Sort controls: "Most used" / "A to Z".
D4. `src/pages/Collections.tsx`: rows like topics, with item count and last updated; "New collection" inline input at the top (verb-first button "Create collection"); empty state with that input as the action; delete confirm already names the collection, move to `ConfirmDialog`.
D5. `src/pages/Notes.tsx`: list rows: note text first (serif 17, 3 lines clamp, `dir=auto`), then item title link and date as `text-meta`; add search box "Search your notes"; empty state "Notes you write on a video page show up here. Open a video and add one."
D6. `src/pages/Settings.tsx`: group into sections separated by hairlines with `h2.text-h2` heads (Account, Connect to Claude, Data, Danger zone); no cards, no caps labels; connector URL row has an input + `Copy link` button that changes to "Copied"; "Disconnect all connectors" moves to Danger zone and uses `ConfirmDialog`; export buttons keep `lib/export.ts`.
D7. `src/pages/Login.tsx`: `paper` background, centred column 360px, wordmark serif 28, one line "Find the link, book or idea you saw in a video." (replaces "Never lose a reference…"), email/password with visible labels (already), submit "Sign in" / "Email me a sign-in link", errors via `ErrorBox` in `role=alert`. No `.card`.
D8. **States.** Standard copy (use consistently):
- Loading lists: skeleton rows; item page: skeleton header. Under 1s render nothing special.
- Empty library: "Nothing saved yet. Paste a YouTube link, or share a video to RefVault from your phone." + "Save a video".
- Empty search: see B8. Empty links/topics/collections/notes: as above, each with one action.
- Error (fetch): "Couldn't load your library. Check your connection and try again." + "Try again".
- Error (save): "Couldn't save this link. It isn't a YouTube video URL. Paste a link like youtube.com/watch?v=…".
- Pending states per 2.9 and Home "Still processing".
D9. **Cleanup and checks.** `grep -rn "card\|brand-\|slate-\|text-xs\|text-\[1\|uppercase\| · " src` must return only intentional hits; run `npm run build`; re-shoot `before` set as `after` (desktop/mobile, light/dark); verify: no horizontal scroll at 375, all tap targets >= 44px mobile, contrast tokens, keyboard path (`/`, Tab order, Esc in sheets), Arabic item page mirrors rows, thumbnail failure shows the fallback, reduced-motion turns off the pulse.

---------------------------------------------------------------------------------------------------
## 5. Components (groups A and B, implemented)

Import paths are relative to `src/`. Tokens and classes live in `src/index.css` and `tailwind.config.js`.

**CSS classes** (`index.css`): `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-danger`, `.btn-danger-solid` (44px touch / 40px from `sm`);
`.btn-sm` (add to any button: 44px touch / 32px desktop); `.icon-btn` (square 44/32); `.input` (also textarea); `.chip` (use on span, a or button);
`.row` (list row: bottom hairline, py-4); `.sheet` (raised surface); `.popover` (floating surface with shadow); `.locator`; `.skeleton`; `mark`; `.num` (tabular figures).
Type utilities: `text-display|title|h2|lead|read|body|meta|small`. Colours: `paper sheet pop ink ink-2 line binding on-binding binding-wash marker marker-ink danger warn-bg warn-ink`.
Radius: `rounded-tab` (4), `rounded-ctl` (8), `rounded-frame` (12). Widths: `max-w-prose|list|item`. Legacy to delete after C/D: `.card`, `.section-title`, `brand-*` colours, `StatusBadge`, `PageHeader subtitle`, `EmptyState icon`.

**`lib/format.ts`**: `formatTimestamp(sec)` -> "1:02:03"; `formatDate(iso)` -> "7 Oct" (year added if not current); `timeAgo(iso)` -> "5m ago", "3h ago", "yesterday", then a date. (`timeAgo` is still re-exported from `components/ui`.)

**`components/ui.tsx`**
- `Spinner({ label? })` inline busy indicator (not for lists).
- `ErrorBox({ message, onRetry? })` danger row; `onRetry` shows "Try again".
- `EmptyState({ title, children?, action? })` heading + sentence + action node (`icon` ignored, legacy).
- `PageHeader({ title, meta?, actions? })` serif title, one meta line, right-aligned actions (`subtitle` = legacy alias of `meta`).
- `StatusNote({ status, long? })` text with dot for fetched / transcript_pending / error; renders nothing for analyzed. `long` adds the expected wait.
- `Highlight({ text })` renders `[[match]]` as `<mark>`.

**`components/Thumb.tsx`** `Thumb({ src?, title, channel?, duration?, className? })` image with designed fallback (initial letter on `binding-wash`). Size via `className` (default `aspect-video w-full`); `duration` seconds shows a chip.
**`components/Locator.tsx`** `Locator({ sec, onSeek?, to?, label?, className? })` yellow timestamp tab. `onSeek` -> button; `to` -> router link; neither -> static. Renders nothing when `sec` is null.
**`components/Skeleton.tsx`** `Skeleton({ className })`, `SkeletonRows({ n=6, thumb=true, delay=300 })` (appears only after `delay` ms).
**`components/IconButton.tsx`** `IconButton({ label, shortcut?, children, ...buttonProps })` aria-label + title, 44px touch / 32px desktop.
**`components/Menu.tsx`** `Menu({ label, trigger, items, align?='start'|'end', triggerClassName?='icon-btn' })`, `items: { label, onSelect, icon?, danger?, checked?, disabled? }[]`. Arrow keys, Esc, focus restore; `checked` makes it a radio list.
**`components/Sheet.tsx`** `Sheet({ title, onClose, children, placement?='auto'|'center'|'full', dismissible?=true, role?, hideTitle? })` modal with focus trap/restore and scroll lock; render only while open. Put `data-autofocus` on the control that should get focus first.
**`components/ConfirmDialog.tsx`** `ConfirmDialog({ title, body?, confirmLabel, cancelLabel?, danger?, onConfirm, onClose })` replaces `window.confirm`; Cancel is focused; `onConfirm` may be async, dialog closes on resolve and shows thrown errors. Render only while open (`{target && <ConfirmDialog/>}`); name the entity in `title`.
**`components/ItemRow.tsx`** `ItemRow({ item: SearchRow, showSnippet? })` library/search/home row (replaces `ItemCard`). `SearchRow.duration_sec` is filled by `searchItems`.
**`components/AddVideoDialog.tsx`** `AddVideoDialog({ initialText?, onClose })` Save sheet (also used by the `/add` share route).
**`SiteIcon.tsx`** unchanged (legacy coloured initials; D1 removes its use).
