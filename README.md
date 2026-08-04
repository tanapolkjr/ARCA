# ARCA E-Service — Web App

Internal back-office web app for ARCA (formerly Smart Living) — installation and
service management for Smart Home products, plus the **Sourcing** module for
deciding which products are worth importing. React SPA on Vercel, Supabase for
everything backend (Postgres + Auth + Storage), no custom server.

> Renamed from "Smart Living" in §29, which also merged in the standalone
> Supplier Management app (formerly 4 HAUS). Sections 1–28 below still say
> "Smart Living" in places — they are a historical changelog and were left as
> written.

**เริ่ม deploy จริง → อ่าน [`DEPLOY.md`](./DEPLOY.md) ทำตามทีละข้อ**

---

## 1. Technology stack & architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite | SPA |
| Styling | TailwindCSS 3 | indigo accent, `rounded-2xl` cards, `shadow-sm` |
| Backend | **Supabase only** — no custom server | Postgres + Auth + Storage |
| Data access | `@supabase/supabase-js` directly from the browser | no API layer / no ORM |
| Auth | Supabase email+password; accounts created by admin in dashboard (no public signup) | profile row auto-created by DB trigger on first login |
| Security | RLS on every table — read-all-authenticated baseline, write restricted on the tables called out in the Permission Matrix (spec §8) | see `supabase/migrations/0001_init.sql` §8 |
| Storage | one public-read bucket `smart-living-files`, 500MB file size limit, **resumable (TUS) upload** for large files | see `src/lib/upload.js` |
| Hosting | Vercel, SPA rewrite in `vercel.json`, auto-deploys on push to `main` | |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | baked in at build time |
| State/data | small custom hook (`useQuery`) — deliberately NO react-query/redux | simplicity first |
| Icons | lucide-react | |
| Router | react-router-dom v6 | |

### Folder structure (same layering rule as 4 HAUS)

```
src/
  lib/          pure logic, no React: supabaseClient.js, upload.js, format.js, mockData.js
  api/          one data-access module per table/feature, no UI (only `projects.js` wired so far — see §3)
  hooks/        useAuth (session context), useQuery, RequireAuth
  components/
    ui/         reusable primitives: Field, TextInput, Select, Pill, Modal, SearchSelect,
                CommentPanel, StatusStepper, ContactModals, FileUploader
    layout/     AppShell, Sidebar, TopBar
  features/     one folder per module: auth, dashboard, project, ticket, pmrequest, contact, stock
supabase/migrations/   0001_init.sql, 0002_storage.sql  — run manually in SQL Editor, in order
```

**Rule:** `lib/` knows no React → `api/` knows no UI → `components/ui/` knows no business
logic → `features/` composes all three. A new module = a new `features/` folder + a new
`api/` module.

---

## 2. What's real vs. what's still mock

| Module | Status |
|---|---|
| **Auth (Login/Logout)** | ✅ Real — Supabase email+password, session persisted, route-guarded via `RequireAuth` |
| **File upload** | ✅ Real — resumable (TUS) upload to Supabase Storage, persisted as `project_files` rows, wired into Project → File tab |
| **Project** | ✅ Real — every tab (Customer, SO Info, Device Install, Install Period, Device Detail, Payment Period, File, App Data) reads/writes Supabase, all example rows removed |
| **Ticket** | ✅ Real — every tab (Customer/Device Install/Device Detail refs, Request & Issue, Subcontractor, เบิก/คืน/รับของเก่า, Update) reads/writes Supabase. เบิก/คืน stock movements adjust real stock_balances |
| **PM Request** | ✅ Real — list + full Detail/Edit page, status changeable (incl. marking เสร็จสิ้น when done), with Comment panel |
| **Internal Chat** | ✅ Real — 1-1 and group conversations, realtime message delivery via Supabase Realtime. **Requires running the new `supabase/migrations/0003_chat.sql`** |
| **Contact** | ✅ Real — list + create Customer wired; Site Master CRUD also lives here, used by Project's live Site/Customer search |
| **Stock** | ✅ Real — Summary, Transfer, Borrow/Return, Refund, and Purchase Request are all wired and reachable from the sidebar |
| **Comment & Notification panel** | ✅ Real — persists to `comments`/`comment_mentions`/`notifications`, @mention fans out real notifications, bell icon reads real unread count |
| **Dashboard** | ✅ Real — Project/Ticket pipeline counts, Overdue list, and warranty % all query Supabase directly (no mock numbers) |
| **Dark mode** | ✅ Real toggle (persisted), applied to shell + all shared UI primitives (forms, cards, modals, tables use `dark:` variants); some page-specific one-off elements may still need polish |
| **Settings** | ✅ Real — User & Role management, Stock Location management |
| **Internal chat between users** | ⏳ Not built — see Open Items, needs scope confirmation |
| Report, Accounting, Settings | ⏳ Placeholder pages — not designed yet (open items in the spec) |

Nothing about the **features/fields/workflow** was changed or simplified during this
conversion — every tab, status, toggle, and field from the design spec is still there.
Only the *data source* and *file layout* changed.

## 3. Two things worth knowing about the Project/Site auto-fill

- The `sites` table (Site Master) only stores `name/address/province/google_map/gps` per
  the spec — it does **not** have its own contact/phone columns. So selecting a Site now
  auto-fills Address/Province/Google Map onto the Project, but **Project Contact / Tel
  stay manually entered** (they were only auto-filled from a mock lookup before; that
  mock had contact/phone fields the real Site Master schema doesn't have).
- `SearchSelect` (in `components/ui/primitives.jsx`) now supports an `asyncSearch(query)`
  prop for live Supabase lookups (debounced 250ms) alongside its original static
  `options` array mode — Project's Site/Customer pickers use the async mode now.

## 4. Large file uploads (100MB+)

Fixed via Supabase Storage's **resumable upload endpoint (TUS protocol)** — see
`src/lib/upload.js` for the implementation and the comment block explaining why the
plain `supabase.storage.upload()` call (what 4 HAUS uses, fine for small photos) isn't
enough for large attachments. The bucket's size ceiling is set in
`supabase/migrations/0002_storage.sql` (currently 500MB — raise it there if needed).

## 5. Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

```bash
npm run build      # production build → dist/
npm run preview    # sanity-check the production build locally
```

## 6. Full spec recheck (this pass) — what was actually broken

A full pass comparing the running app against the spec document turned up real
gaps, not just cosmetic ones. Fixed in `0004_fixes.sql` + matching code:

1. **Device Install's "จองสต็อก" toggle never touched the Stock module at
   all.** It only flipped a boolean on `project_device_install` — spec
   §2.2.3/§7.1 require it to actually move `stock_balances.reserved`. Fixed:
   added a `location_id` to `project_device_install` and wired real
   reserve/unreserve/release logic (`adjustReservation` in `api/stock.js`).
2. **There was no "รับสินค้าเข้าคลัง" (Stock In) feature anywhere** —
   `on_hand` could only ever go down (withdrawals), never up. This is one of
   the five core Stock sub-modules in the spec and had been missed entirely.
   Added a real Stock In flow (Stock Summary page → "รับสินค้าเข้าคลัง").
3. **No way to create a Product/Stock Item in the UI** — `createStockItem`
   existed in the API layer but nothing called it. Added a "เพิ่มสินค้าใหม่"
   modal on the Stock Summary page.
4. **Physical stock actions (withdraw/transfer/borrow) were writable by any
   authenticated user**, contradicting the Permission Matrix (§8.2, which
   restricts these to Super Admin/Manager/Store). Split Install Period's
   "New Jobs" into a **request step** (any planning role) and a **fulfill
   step** (Store/Manager/Super Admin only, gated in the UI and backed by
   RLS on `stock_transactions`/`stock_transfers`/`stock_borrows`).
   `stock_balances` itself stays on the general policy on purpose — see the
   comment in `0004_fixes.sql` for why reservation couldn't be gated the
   same way.
5. **Project Source and "ต้องการตรวจสอบการชำระเงินหรือไม่" fields** existed
   in the database but were missing from the Customer tab UI. Added both.
6. **Unsaved Changes Warning (spec §2.5)** was designed but never actually
   implemented. Added a `beforeunload` guard plus a confirm-before-navigate
   check on the "ย้อนกลับ" button, on Project/Ticket/PM Request detail pages.

Everything above required **migration `0004_fixes.sql`** — see DEPLOY.md.

### Still-open gaps (honest list, not fixed this pass)

- `purchase_requests` / `stock_refunds` status **transitions** aren't
  role-aware at the RLS level (e.g. nothing stops a non-Manager from
  clicking a PR to "อนุมัติแล้ว"). Doing this properly needs a Postgres
  trigger comparing OLD/NEW status per role — bigger than this pass.
- Multi-step DB writes (e.g. `fulfillInstallJob`, `receiveStock`) are not
  wrapped in a single Postgres transaction, since supabase-js has no
  client-side transaction API without an RPC function. Fine for one
  concurrent user per job; a `*_rpc()` function would be the hardening step.
- Report module is still a placeholder (explicitly deferred earlier).
- Dark mode covers the shell, shared primitives, and all list/detail pages;
  a few deeply nested one-off elements may still want polish.

## 7. This round's fixes (real bugs found from live testing)

1. **Chat couldn't create conversations at all** — `chat_participants` RLS
   policy queried itself, causing Postgres to detect infinite recursion and
   reject every query. Fixed with a `SECURITY DEFINER` helper function
   (`is_chat_participant`) so membership checks don't trigger RLS on
   themselves. **Needs migration `0005_fixes2.sql`.**
2. **Comment @mention was unusable** — the dropdown closed the instant you
   typed a second character after `@` (it only checked `text.endsWith("@")`).
   Fixed to track and filter on everything typed after the `@` properly.
3. **File uploads failed with "Invalid key"** whenever the filename had
   Thai characters, spaces, or `&` — Supabase Storage rejects those in the
   object key. Fixed by sanitizing only the *storage key*; the real
   filename is still shown in the UI from the database record, so nothing
   is lost.
4. **New Jobs serial entry redesigned** — was one multi-line textarea per
   item (easy to enter the wrong count); now renders one input box per
   unit, matching the exact remaining quantity. Duplicate serials are now
   caught with a clear message instead of a raw constraint-violation error.
5. **Delete added** to Stock (Transfer/Borrow/Refund), Purchase Request,
   and PM Request. **Project delete** added too, gated so it's only free
   while status is New Request/Request Submitted — past that, only
   Manager/Super Admin can delete (enforced at the database level via RLS,
   not just hidden in the UI).
6. **DELETE policies were missing entirely** for several tables — RLS
   denies by default with no matching policy, so none of the delete
   buttons above would have worked without this.
7. **Contact module expanded**: now has Customer / Project (Site) tabs.
   Both are clickable — Customer cards open a full edit page (fields +
   Key Contacts management), Site cards open a Site edit page (name,
   address, province, Google Map), each showing linked Projects.
8. **Project List page**: replaced the Phone column with Plan + Salesman,
   per feedback.

All of the above (except #2, #3, #4 which are pure code fixes) require
running **`supabase/migrations/0005_fixes2.sql`**.

## 8. Latest fix — Project list couldn't load at all

**Root cause found from the exact error text**: `Could not embed because more
than one relationship was found for 'projects' and 'users'`. The `projects`
table has *two* foreign keys to `users` (`salesman_id` and `created_by`), so
when the Salesman column was added to the list query, Supabase/PostgREST
couldn't tell which relationship to use for the join — it needs the FK
pinned explicitly (`users!projects_salesman_id_fkey`), same pattern already
used elsewhere (e.g. PM Request's requester/assignee). Fixed. No new
migration needed — this was a pure query-syntax fix in `api/projects.js`.

Also added: a delete icon directly on each row of the Project list (not just
inside the detail page), and re-verified every other `:users(...)` /
`:stock_locations(...)` embed in the codebase for the same ambiguity risk —
confirmed the rest were already pinned correctly.

**Re: the Comment box** — closely re-reviewed `CommentPanel.jsx` and
`api/comments.js` end to end and could not find a further code bug beyond
the @mention fix already shipped last round. That fix only takes effect
once the *code* (not just the SQL migration) is redeployed — if the send
button still does nothing after pulling this latest zip onto GitHub, please
open the browser console (F12 → Console tab) when clicking "ส่ง" and share
whatever red error appears there; that's what made the chat and project-list
bugs above findable in one pass.

## 9. Delete added everywhere it was missing

Root cause: RLS denies any operation with zero matching policies, and DELETE
policies had only ever been added for a handful of tables (`projects`,
`stock_transfers`, `stock_borrows`, `stock_refunds`, `purchase_requests`,
`pm_requests`). Every other table never got one — so a delete button on
Stock Summary / Ticket / Contact could never have worked no matter what the
UI code did. Fixed in `0007_delete_policies.sql`, which adds a delete policy
to every remaining table (customers, sites, tickets and their sub-tables,
stock_items, project sub-tables, comments, notifications, etc).

Also added on the code side:
- **Stock Summary**: delete a product (blocked with a clear message if it
  has stock history — on_hand/reserved/movement records reference it).
  Also fixed `listStockSummary` to list from `stock_items` first, so newly
  added products with zero stock movement now actually show up (previously
  invisible until their first Stock In).
- **Ticket**: delete from both the list and the detail page.
- **Contact**: delete both Customer and Site cards (blocked with a clear
  message if a Project still references them).
- **PM Request**: delete added to the detail page too (list already had it).

Every one of the above requires **migration `0007_delete_policies.sql`**.

## 10. Comment box — made failures visible + added optimistic display

Found a real gap: `CommentPanel` never captured or displayed the *error*
from loading comments — only from sending. If the read ever failed for any
reason, it would fail completely silently: no red message, box just stays
empty forever. Fixed:

1. **Load errors are now shown** in the panel (and logged to console) —
   if this was the actual cause, it'll finally be visible instead of silent.
2. **Sent comments now appear immediately**, independent of the follow-up
   re-fetch — the comment you just sent is shown right away using the data
   already returned from the insert itself, rather than waiting on (and
   depending entirely on) a second read succeeding.

## 11. Chat RLS — bulletproof version

If chat is still broken after `0006_chat_rls_reset.sql`, run
**`0008_chat_rls_bulletproof.sql`** instead — it doesn't assume any specific
policy names exist (unlike 0006), it looks up whatever is *actually* on the
three chat tables via `pg_policies` and removes all of it before recreating
clean rules. Includes a commented-out diagnostic query at the bottom to
directly inspect what's there if it's still broken after this.

## 12. Found it — the Comment error message finally worked

The new error display added in §10 immediately paid off: it showed
`Could not embed because more than one relationship was found for
'comments' and 'users'` — the same bug class as the earlier
projects/salesman one, but in a place that's easy to miss: `comment_mentions`
and `notifications` are both bridge tables linking `comments` to `users`
(each has a FK to both), so PostgREST saw multiple possible paths between
`comments` and `users` and refused to guess. Fixed by pinning the exact FK
(`users!comments_author_id_fkey`) in `api/comments.js` (listComments) and
`api/notifications.js` (the nested comment→author embed).

Also re-audited every other `:users(...)` embed in the codebase for the
same "bridge table" risk (any junction table with FKs to both sides) —
confirmed `chat_conversations`/`chat_messages` don't have this issue.

Pure code fix, no new migration needed.

## 13. Project Source options + Salesman UX

- **Project Source** dropdown updated to: Developer, Designer, Dealer,
  Partner, End-User, Home Builder, Phuket (plain text column, no DB
  constraint — pure UI change).
- **Salesman** dropdown was filtering to Sale/PM roles only, which meant
  real accounts like Super Admin/Manager never showed up as selectable
  options even though a small team often has those roles doing sales too.
  Now lists every active user. Also auto-defaults to whoever is currently
  logged in when creating a project (still fully changeable) — saves a
  click for the common case where the creator is the salesperson.

Pure code fix, no new migration needed.

## 14. File tab improvements

- Button label shortened from "อัปโหลดไฟล์ (รองรับไฟล์ใหญ่ 100MB+)" to "แนบไฟล์"
  (the 100MB+ note moved to a small hint line instead).
- **Every file in the list is now clickable** — opens/downloads it via the
  Storage bucket's public URL (the bucket is already public-read from
  `0002_storage.sql`, so no new policy needed).
- **Added an external Link field** — paste a Google Drive/OneDrive/etc URL
  with an optional display name, and it shows in the same file list with a
  link icon instead of a file icon. No schema change needed: external links
  reuse the same `storage_path` column as uploaded files — the UI tells
  them apart by checking whether the value is already a full URL.

Pure code fix, no new migration needed.

## 15. Three fixes: date display bug, Overdue logic, PM Request attachments

1. **Real bug found**: dates in Ticket ("วันเวลาสะดวกติดต่อกลับ", "วันที่รับเรื่อง")
   and PM Request ("วันที่ต้องการใช้") appeared empty even after saving.
   Root cause: Postgres returns `timestamptz` columns with a timezone
   suffix (e.g. `2026-07-20T10:00:00+00:00`), but HTML's
   `<input type="datetime-local">` only accepts exactly `YYYY-MM-DDTHH:mm`
   — any timezone suffix makes the browser silently blank the field. The
   save was actually working the whole time; the field just could never
   display what got saved. Fixed with `toDatetimeLocalValue()` in
   `lib/format.js`, applied everywhere this pattern was used.
2. **Overdue logic was incomplete** — Ticket and PM Request never checked
   their actual due-date fields at all. Now: Ticket checks
   `appointment_date` (falls back to a days-since-reported heuristic if no
   appointment is set yet), PM Request checks `needed_at`. Both show up on
   the Dashboard's Overdue list and link straight to the record.
3. **PM Request now has a File/Link attachment section** (same pattern as
   Project's File tab — upload large files, or paste an external link like
   Google Drive with an optional display name).

**Requires migration `0009_pm_request_files.sql`** (new table for PM
Request attachments). The date and Overdue fixes are pure code, no SQL
needed for those two.

## 16. Date bug, part 2 — the save side

§15 fixed the *display* side of the datetime bug. This fixes the *save*
side: the raw bare string from a datetime-local input (e.g.
`2026-07-19T19:49`, no timezone, no seconds) was being sent directly to a
`timestamptz` column, which risks Postgres/PostgREST either rejecting it or
resolving the timezone differently than intended — plausible cause of
values reverting to empty after save+refetch. Added `fromDatetimeLocalValue()`
in `lib/format.js`, which resolves the local time in the browser first and
sends a fully-qualified ISO string instead, removing the ambiguity.
Applied to all three fields: PM Request's "วันที่ต้องการใช้", Ticket's two
datetime fields.

Also worth knowing: if a browser's native date/time picker is still open
when you click "Save Data" (like mid-selection), some browsers don't commit
the value until you click elsewhere first. Click away from the calendar
picker once to close it, then Save, if this ever seems to happen again.

Pure code fix, no new migration needed.

## 17. Product Master — bulk import from Excel

Stock Summary → "นำเข้าจาก Excel" — upload an `.xlsx`/`.xls` file with a
header row containing at least **Model Code** (Description, Category, Unit,
Reorder Point are optional; Thai column names like รหัสสินค้า/รายละเอียด/
หมวดหมู่/หน่วย are also recognized). Shows a preview before confirming.

Uses `upsert` on `model_code`, so re-importing the same file after fixing a
typo just updates the existing rows instead of erroring — safe to run
multiple times.

The Excel parsing library is lazy-loaded (only downloads when someone
actually opens the import dialog) so it doesn't add to the initial page
load for everyone else.

Pure code + one new npm dependency (`xlsx`) — no new migration needed,
existing `stock_items` RLS already covers insert/update.

## 18. Product Master — Category + Sub-Category

Added `sub_category` to `stock_items`. Now available in:
- The "เพิ่มสินค้าใหม่" (Add Product) modal
- The Excel import — recognizes both "Category"/"Sub-Category" headers (and
  Thai equivalents หมวดหมู่/หมวดหมู่ย่อย) exactly as they appear in a real
  BOQ export, plus "Product Name" as another accepted header for description
- The Stock Summary table itself, as two new columns
- Search box now also matches against category/sub-category, not just
  model code/description

Verified against a real 207-row BOQ file (Category/Sub-Category/Model/
Product Name columns) — the header-matching logic picks all four up
correctly with no manual column mapping needed.

**Requires migration `0010_stock_subcategory.sql`.**

## 19. Excel import — duplicate Model Code crash fixed

Error was `ON CONFLICT DO UPDATE command cannot affect row a second time` —
a real Postgres limitation: a single upsert statement can't touch the same
row twice. Checked your actual BOQ file: it has 6 Model Codes that each
appear twice for what look like genuinely *different* products (e.g.
"BLEND Switch PRO-No Neutral" and "BLEND Switch PRO(SL/White 1 way)" both
filed under `LS240-LW1`) — a data-entry issue in the source sheet, not
something the import can safely guess the "correct" answer for.

Fixed the crash (de-dupes within the batch, keeping the last occurrence per
code) and added a clear warning **both in the preview and after import**
listing exactly which codes were duplicated, so you can go check/fix the
source file if the duplication wasn't intentional.

Pure code fix, no new migration needed.

## 20. Searchable product picker everywhere (not just Device Install)

With 200+ products now in the system after the Excel import feature, a
plain dropdown became unusable to scroll through. Replaced with the same
type-to-search picker already used for Site/Customer, in every place that
picks a product:
- Project → Device Install (the one specifically reported)
- Ticket → เบิก/คืน/รับของเก่า
- Stock → ยืมคืนสินค้า (new borrow)
- Stock → รับสินค้าเข้าคลัง (Stock In)

Pure code fix, no new migration needed.

## 21. "Days to Install" showed overdue on completed projects

Real bug: the stat card kept calculating days-overdue against the
installation date even after a project reached "Installation Completed" —
made finished projects look like they were still late. Fixed: once status
is Installation Completed, the card shows "เสร็จสิ้นแล้ว / Project
Completed" in green instead of the overdue calculation.

(The Dashboard's Overdue list itself was already correct — it already
excludes Installation Completed/Cancelled projects. This bug was isolated
to this one stat card on the Project detail page.)

Pure code fix, no new migration needed.

## 22. Click-outside-to-close for popups

Added a reusable `useClickOutside` hook and applied it to every popup that
was missing this — previously they only closed by clicking their own
toggle button again:
- Notification bell dropdown
- User profile menu (top-right)
- Comment box's @mention suggestion list (closes on blur now too)

`Modal` (used for every add/edit form) and `SearchSelect` already had
correct closing behavior (backdrop click, and input blur respectively) —
checked both, no changes needed there.

Pure code fix, no new migration needed.

## 23. Stock page renamed to "Inventory" + pagination added

- Sidebar label and breadcrumb: "Serial Number" → "Inventory" (the actual
  "Serial Number" input field inside the รับสินค้าเข้าคลัง modal was left
  as-is — that one really does mean serial numbers, different thing).
- **Pagination added** to the Stock Summary table — 50 items per page, with
  ก่อนหน้า/ถัดไป controls and a "แสดง X–Y จากทั้งหมด Z รายการ" counter.
  With 200+ products now in the system this was rendering as one very long
  page; resets to page 1 automatically when search/location filters change.

Pure code fix, no new migration needed.

## 24. Cancel Withdrawal (ยกเลิกการเบิก) — Install Period

New feature, and fully automatic once built correctly. Real design problem
first: `stock_transactions` and `project_device_detail` never recorded
*which job* they came from — only the project — so with multiple jobs on
one project there was no reliable way to know which stock movements
belonged to which job. Fixed by adding an `install_job_id` link
(`0011_cancel_withdrawal.sql`) and recording it at fulfillment time going
forward.

**What data you need to enter to cancel: none.** Everything required (item,
location, quantity, serials) was already captured automatically when the
job was fulfilled. Click "ยกเลิกการเบิก" on a job with status เบิกสินค้าแล้ว
(Store/Manager/Super Admin only) and the system:
- Adds the withdrawn quantity back to `on_hand`
- Logs a `cancel_withdraw` transaction for the audit trail
- Deletes the Serial/Warranty (Device Detail) records that job created
- Rolls back the Device Install tab's "เบิกแล้ว" count
- Marks the job "ยกเลิกแล้ว"

**Known limitation, stated honestly**: jobs withdrawn *before* this update
have no `install_job_id` link, so they can't be auto-reversed — the app
shows a clear message telling you to adjust stock manually via the Stock
page for those older jobs, rather than guessing.

**Requires migration `0011_cancel_withdrawal.sql`.**

## 25. Job history in Device Install + safer per-serial return flow

**Also fixed proactively**: migration 0011 added `cancelled_by` to
`project_install_jobs`, which meant it now has two FKs to `users`
(`requested_by`, `cancelled_by`) — the exact same "more than one
relationship" ambiguity bug as before, just self-inflicted this time.
Caught and fixed before it could actually break anything in production.

**New features requested:**

1. **Device Install → "ดู Job"** — each row with a withdrawal now has a
   link that expands to show every Job that withdrew against that model:
   job code, when, status, and which serials. No more needing to
   cross-reference the Install Period tab manually.

2. **Device Detail → "ดึงกลับเข้าคลัง"** (per-serial return, different from
   the whole-job Cancel Withdrawal) — Store/Manager/Super Admin only.
   Requires **typing the exact Serial Number to confirm** before the button
   enables (prevents returning the wrong unit by mis-click), shows a clear
   warning that this deletes the record, then: credits stock back, logs a
   `return` transaction, rolls back the Device Install withdrawn count, and
   removes the serial from Device Detail.
   - Same honest limitation as Cancel Withdrawal: if no matching withdraw
     transaction is found (old/manually-entered records), it still deletes
     the record but tells you stock needs a manual check instead of guessing.

Pure code fix, no new migration needed — reuses `install_job_id` from 0011
and the existing `return` transaction type.

## 26. Borrow (ยืมคืนสินค้า) redesigned to match Device Install pattern

Real gap found while redesigning: the old Borrow module was single-item
only, and **never actually touched stock in either direction** — borrowing
didn't decrement on_hand, returning didn't increment it back. Completely
rebuilt:

- **Multi-item borrow jobs** — one "ใบยืม" can now include several
  different products, each with its own quantity, matching the request to
  make this "คล้ายๆกับ Project" (like the Project Device Install flow).
- **Serial capture per unit** — same per-unit input boxes as Install
  Period's fulfillment step, one box per quantity.
- **Real stock movement both ways** — borrowing decrements `on_hand` at
  the chosen location immediately; returning (now per individual
  item/serial, not just the whole borrow at once) adds it back. Both log
  a `stock_transactions` row for the audit trail.
- **Expandable rows** — click a borrow to see every item/serial in it and
  return them individually; the header auto-closes to "คืนแล้ว" once every
  item is back.

**Requires migration `0012_borrow_redesign.sql`** (new `stock_borrow_items`
table + a `location_id` column on `stock_borrows`).

## 27. Pre-launch logic recheck — 8 fixes (migration 0013)

Full audit of every stock/approval flow before launch, done as report-first →
approve → fix (per request). What was found and fixed:

1. **ยืมคืนสินค้าสร้างไม่ได้เลย (launch blocker)** — migration 0012 moved borrow
   items to `stock_borrow_items` but forgot to drop the legacy `NOT NULL` on
   `stock_borrows.stock_item_id`, so every new borrow header insert failed at
   the database. Fixed in `0013` with a one-line `drop not null`.
2. **ย้ายคลังไม่เคยย้ายสต็อกจริง** — a transfer was a from/to header only: no
   item lines existed, no balance ever moved, and the modal promised a detail
   page that was never built. Now: `stock_transfer_items` (0013), the create
   modal takes multiple item+qty lines, creating decrements the source
   (`transfer_out`), "ยืนยันรับของ" credits the destination (`transfer_in`),
   receiving twice is blocked, and deleting an in-transit transfer auto-returns
   the goods to the source. Old itemless transfers show a clear "รุ่นเก่า" note.
3. **ยกเลิกการเบิกเบิลสต็อกได้** — `cancelInstallJob` had no status guard (two
   tabs / double click → stock credited back twice) and replayed withdraws for
   serials already returned individually (double credit). Now it refuses jobs
   already "ยกเลิกแล้ว" and skips serials that already have a
   `return`/`cancel_withdraw` transaction for that job.
4. **คืนสินค้าราย Serial ลบข้อมูลโดยไม่คืนสต็อก (เงียบๆ)** — the withdraw-txn
   lookup used `.maybeSingle()` on serial alone; a serial with >1 historical
   withdraw made it error (swallowed) and the Device Detail row was deleted
   with NO stock credit. Now scoped to the row's `install_job_id` when present,
   otherwise latest-withdraw-wins, and all errors are surfaced.
5. **Reserved เพี้ยนเมื่อแก้จำนวน** — editing `planned_qty` while a Device
   Install row stayed reserved never adjusted `stock_balances.reserved` (only
   the on/off flip did). Also, fulfilling a job decremented `reserved` even for
   rows that were never reserved — silently eating another project's
   reservation on the same item/location. Both fixed.
6. **เบิก/คืนใน Ticket ไม่บังคับเลือกคลัง** — with no location chosen, nothing
   was written to balances or the ledger while the toast still said
   "ปรับสต็อกแล้ว". Location is now required for เบิก/คืน (UI + API), stored on
   the movement row (`ticket_stock_movements.location_id`, 0013), and a return
   to a warehouse that never stocked the item now creates the balance row.
7. **Multi-step stock writes swallowed errors** — inner inserts/updates in
   receive/fulfill/borrow/reserve/ticket flows ignored the returned `error`;
   an RLS denial could half-complete a flow silently. Every step now throws.
   (Real DB transactions via a Postgres RPC remain the follow-up hardening.)
8. **ใครก็กดอนุมัติได้** — advancing a Purchase Request to "อนุมัติแล้ว" or a
   Refund to "อนุมัติ" is now gated to Manager/Super Admin in the UI (button
   shows "รออนุมัติ (Manager)" for other roles). DB-level transition-aware RLS
   is still the known open item from 0004's note.

Also: PM Request notifications now deep-link to `/pm-request/:id` instead of
the list. Verified: FK-embed ambiguity pass across all 22 embedded selects
(all multi-path pairs pinned), RLS coverage for 0009–0012 tables, clean
`npm run build`.

## 28. PM Request due-date visibility

- PM Request list now has a "วันที่ต้องการใช้" (needed_at) column; the date
  turns red when it has passed and the request isn't เสร็จสิ้น/ยกเลิก.
- Dashboard: new "PM Request ค้างดำเนินการ" section — counts of unfinished
  requests split into ขอสำรวจหน้างาน / ขอออกแบบระบบ / ขอทดสอบสินค้า / อื่นๆ,
  plus a list of the nearest-due pending requests sorted by needed_at
  (overdue ones flagged in red, no-due-date items last), each row linking to
  the request detail. No DB change needed.

## 29. ARCA rebrand + Supplier Management merged in as the Sourcing module (migration 0014)

Two things happened in this round: the app was renamed, and the standalone
Supplier Management app (formerly "4 HAUS", `4haus.vercel.app`) was absorbed as
a module instead of being rewritten.

### 29.1 Rename Smart Living → ARCA

- Sidebar and Login wordmark now read **ARCA**, set in Inter 800 with tightened
  tracking via a new `.brand-wordmark` class in `index.css`.
- `<title>` → "ARCA E-Service"; `package.json` name → `arca-e-service`.
- `index.html` now loads Inter + Noto Sans Thai and applies the saved theme
  before first paint (no more dark-mode flash on reload).
- **Deliberately NOT renamed**: the Storage bucket `smart-living-files` and the
  `smart-living-theme` localStorage key. Renaming the bucket would invalidate
  every file path already stored in the database; the theme key is invisible to
  users and renaming it would just reset everyone's theme. Both now carry a
  comment saying so.

### 29.2 What came across, and where it lives

| Source (standalone app) | Here |
|---|---|
| `src/lib/*.ts` | `src/sourcing-lib/` |
| `src/api/*.ts` | `src/sourcing-api/` |
| `src/components/ui/*` | `src/components/sourcing-ui/` |
| `src/features/*` | `src/features/sourcing/` |
| `src/hooks/useQuery.ts` | `src/hooks/useSourcingQuery.ts` |
| its `App/main/AppShell/Sidebar/LoginPage` | dropped — ARCA already has them |
| its `users` table + auth trigger | dropped — ARCA's `public.users` is the one profile table |
| migrations 0001–0003 | folded into `0014_sourcing_module.sql` |

Routes: `/sourcing` (overview), `/sourcing/factories`, `/sourcing/products/:id`,
`/sourcing/compare`, `/sourcing/reports`, `/sourcing/settings`.

**The module is TypeScript and the rest of the app is JavaScript.** That is on
purpose. `vite build` uses esbuild, which transpiles `.tsx` without
type-checking, so a mixed tree builds with no extra step and a type error can
never block a Vercel deploy. Converting the module to JS would have meant
editing all 52 of its files including `calculations.ts` — verified against the
client's own spreadsheets — for zero user-visible benefit.

`npm run typecheck` (new script) runs `tsc` over the module only; **run it
alongside `npm run build` before delivering any change that touches
`src/features/sourcing`, `src/sourcing-lib`, `src/sourcing-api`, or
`src/components/sourcing-ui`.** The build alone will not catch type errors.

### 29.3 Access: Super Admin / Manager only

Every screen in the module shows landed cost, margin or ROI, so the whole
module is gated rather than individual figures — hiding the numbers would have
left empty tables and, worse, would have made `suggestRecommendation()` produce
a *different* recommendation for users who can't read margin.

- UI: `SOURCING_ROLES` in `src/hooks/useAuth.jsx`, enforced by
  `RequireRole` via `src/features/sourcing/SourcingLayout.jsx`. The sidebar
  group is hidden for other roles.
- DB: `public.is_sourcing_user()` (SECURITY DEFINER) backs a single
  `for all` policy on each of the seven tables, plus the write policies on the
  `product-media` bucket.
- **Change both together.** The UI check is convenience; RLS is the real gate.

### 29.4 Merge seams worth knowing

- **One Supabase client.** `src/sourcing-lib/supabase.ts` re-exports
  `lib/supabaseClient.js` — two clients would mean two auth sessions.
- **Toast.** The module calls `toast(message, kind)`; the platform provider
  exposes `success`/`error`. A three-line `toast` shim was added to
  `useToast.jsx` so none of the module's ~50 call sites needed editing.
- **`useQuery` exists twice on purpose** — the platform's returns an Error
  object, the module's returns a string. They were kept separate
  (`useSourcingQuery`) rather than reconciled.
- **`errMsg` also exists twice** with different arity (`errMsg(err)` vs
  `errMsg(err, fallback)`). Do not "unify" them.
- **`src/hooks/platform-hooks.d.ts`** declares the platform's JS hooks for the
  TypeScript side. When module code starts importing another platform JS file,
  add a `declare module` block there or `npm run typecheck` fails.
- **`profileLoaded`** was added to `useAuth` so role-gated routes don't flash
  "no access" while the profile row is still loading.

### 29.5 Styling

The module's design tokens live in `index.css` under `.sourcing-root`, the
wrapper `SourcingLayout` puts around every module screen. Its original global
rules (`html` font, `*:focus-visible`, `::placeholder`) were scoped to that
class so platform screens look exactly as they did before.

The neutral ramp was retuned from the module's warm greys to the platform's
slate scale, and `--accent` from 4 HAUS brass `#C8A24B` to indigo `#4F46E5`, so
the module reads as part of ARCA. Page titles were matched to the platform's
`text-2xl font-bold tracking-tight`. **A future rebrand (e.g. ARCA HOME red
`#E8412B`) is a two-line change to `--accent` / `--accent-hover`.**

No class name collided: the platform uses none of `.card`, `.input`, `.label`,
`.tnum`, `.badge-outline`, `.badge-fill`.

### 29.6 What was intentionally left out

- **SKU promotion.** Approved products do *not* create `stock_items` yet. The
  two are genuinely different entities — most evaluated products are never
  imported, which is the whole point of the evaluation — so the intended shape
  is `stock_items.source_product_id` plus an explicit "Create SKU from this
  product" button. Deferred by Boss to the next round.
- **User management inside the module.** Its Settings page used to create and
  edit users; that is now the platform Settings page's job (Super Admin only),
  so `addUserProfile()` / `updateUser()` were deleted and the module's Settings
  keeps only the target-channel list. `listUsers()` stays, read-only, for
  showing who scored and who decided.
- **Its ⌘K command palette**, which only knew about sourcing entities.
- **Thai translation of the module UI** — deferred; every label is centralised
  in `sourcing-lib/constants.ts` (`DECISION_LABEL`, `CATEGORIES`, `CRITERIA`).

### 29.7 Rules carried over from the standalone app — do not "improve" these

- The formulas in `sourcing-lib/calculations.ts` (verified against the client's
  spreadsheets).
- `product_costs` is **append-only** — every save inserts a new row. The
  history is the point.
- `exchange_rate` is stored **per estimate**. Never retro-apply a central FX
  rate to old rows.
- `products.status` is derived by `deriveStatus()` and must never be
  hand-edited.
- `decision_reason` is mandatory — it is the Decision Log the business reads.
- Recommendations are **suggestions**; never auto-apply a decision.

## 30. Fresh-deploy pass (docs + `product-media` size limit)

Everything (Supabase project, GitHub repo, Vercel project) was deleted and
rebuilt from zero, which surfaced two gaps:

1. **`DEPLOY.md` rewritten as a from-scratch guide.** It now lists all 14
   migrations in a table with what each one does, warns not to run
   `RESET_full_wipe.sql`, and has a troubleshooting section.
2. **The Super Admin bootstrap is now its own step (§4), flagged as
   unskippable.** `handle_new_auth_user()` inserts new profiles with
   `role = 'Sale'`, and the Settings page only lets a Super Admin change roles
   — so a brand-new project with nobody promoted has *no* way to grant the
   first Super Admin from inside the app, and the Sourcing menu never appears.
   The fix is one field edit in Supabase Table Editor, but it has to be
   documented or it looks like a bug.
3. **`0014` now sets `file_size_limit` on the `product-media` bucket**
   (500 MB, matching `smart-living-files`). Supabase buckets default to a
   50 MB cap, which factory catalogue PDFs can exceed — the same trap
   `0002_storage.sql` already fixed for the platform bucket. The insert uses
   `on conflict do update`, so re-running the migration applies the new limit
   to an existing bucket.

No application code changed in this round.

## 31. Sourcing product images: no cropping, click to enlarge, thumbnail strip

Feedback from the live app: the hero photo was being cropped and there was no
way to view an image full size. Two-up product renders (a lock shown front and
back in one wide image) lost their edges inside the fixed 4:3 box — exactly the
detail someone is trying to judge before deciding to import.

Changed in `features/sourcing/product/ImageManager.tsx` plus a new
`components/sourcing-ui/Lightbox.tsx`:

- **The frame is sized by the photo, not the other way round.** `object-contain`
  in an `inline-flex` frame capped at 440px tall and `min(560px, 100%)` wide, so
  a tall photo gets a tall frame and a wide one gets a wide frame. Nothing is
  cropped anywhere in the module now.
- **The viewer shows the selected image, not only the hero.** Prev/next arrows,
  an `n / total` counter, and a thumbnail strip that scrolls sideways and
  auto-scrolls the active thumbnail into view.
- **Click a photo to open it full screen** (`Lightbox`): `object-contain` at
  92vw × 80vh, ← / → to page through, Esc to close, click the backdrop to
  dismiss, page scroll locked while open.
- **Clicking a photo no longer opens the file picker.** That was the reason
  "click to enlarge" had nowhere to go. Uploading is now the explicit **Add**
  tile at the end of the strip; drag-and-drop still works anywhere on the
  viewer.
- **The caption moved under the viewer** and edits whichever image is on
  screen, instead of a cramped input under each 68px thumbnail.
- Hero is pinned first in the order. Reorder arrows apply to the gallery tail
  and the selection follows the image that moved, so reordering a thumbnail
  that isn't the one on screen no longer jumps to the wrong photo.

`Lightbox` is generic (`{ src, caption, badge }[]`) — reuse it if factory
documents ever need a preview.
