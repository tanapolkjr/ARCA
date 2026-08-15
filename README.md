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

## 32. Approved products flow into Inventory; Inventory rows are editable (migration 0015)

### 32.1 The promotion link

`stock_items.source_product_id → products.id`, with a partial unique index so
one Sourcing candidate can only ever produce one SKU. `ON DELETE SET NULL`,
never CASCADE — deleting an evaluation record must not take a live inventory
item and its stock movements with it.

Field mapping, as specified by the owner:

| Sourcing | Inventory |
|---|---|
| Model number | Model Code (`model_code`) |
| Product name | Description (`description`) |
| Category | Category (`category`) |

`Others` maps its `custom_category_name` across instead of the literal string
"Others", which is the more useful label downstream.

### 32.2 When it happens

Recording an **Approved** decision creates the SKU immediately — approving is
the act that turns a candidate into something the business will stock, so
there is no second step to forget. `promoteToInventory()` never throws on a
business problem: a failed promotion must not undo the decision, which is the
more important record.

Three cases it handles rather than erroring:

- **Model number empty** — Inventory requires it as the model code. The
  Evaluation tab shows why and offers a retry once it's filled in.
- **A SKU with that model number already exists, unlinked** — adopts it instead
  of colliding with the unique constraint. Its description and category are
  left alone; whoever created that row may have deliberate wording, and
  silently rewriting live inventory data would be a nasty surprise.
- **That model number belongs to a different Sourcing product** — refuses and
  says so.

The Evaluation tab shows the current state for any Approved product: "In
Inventory as X", or an **Add to Inventory** button. That button is also the
backfill path for products approved before this release.

**Not automatic in reverse.** Reopening a decision or switching it to Rejected
leaves the SKU alone — by then it may have stock, serials or install history.
Removing it is a manual call.

### 32.3 Inventory column names follow Sourcing

Displayed labels are now **Model Number** and **Product Name** (Category was
already shared). Changed in the table header, the add/edit form, the search
placeholder, the Excel import help text and its error messages.

**Database columns are unchanged** (`model_code`, `description`) — renaming
live columns would touch every stock query, the Excel upsert key and the
install/return flows for zero user-visible gain. Same reasoning as keeping
`factories` in the Sourcing schema.

The Excel importer now accepts `Model Number` / `Product Name` as header
aliases **in addition to** the old `Model Code` / `Description`, so sheets
saved before this release still import.

### 32.4 Editing an Inventory row

Pencil icon on each row opens the same form as "เพิ่มสินค้าใหม่" —
`NewProductModal` became `ProductModal` handling both create and edit, so the
two can't drift apart. `updateStockItem()` added to `api/stock.js`.

Renaming `model_code` is safe: nothing references it as a foreign key
(`stock_transactions`, `stock_balances` and install jobs all key off
`stock_items.id`), so history survives a rename. A unique-violation on save is
caught and reported as a readable message rather than a raw Postgres error.

Rows that came from Sourcing show a small link icon next to the model number,
and the edit form notes that changes here do not flow back to Sourcing.

## 33. โมดูลบัญชี — เอกสารขาย/ซื้อ + PDF + สมุดรายรับ-รายจ่าย (migration 0016)

รอบนี้สร้างฐานของโมดูลบัญชีตาม `ACCOUNTING_MODULE_DESIGN_v3.md` ขอบเขตที่ตกลงไว้คือ
**จบที่เอกสารและลูกหนี้/เจ้าหนี้ แล้วส่งไฟล์ให้สำนักงานบัญชี** ไม่ทำผังบัญชี ไม่ปิดงบ

### 33.1 สิ่งที่ใช้ได้แล้ว

- **ใบเสนอราคา (QT) · ใบแจ้งหนี้ (BL) · ใบกำกับภาษี/ใบเสร็จ (INV) · ใบเสร็จ (RC) · ใบสั่งซื้อ (PO)**
  สร้าง แก้ ออกเลขที่ ดูตัวอย่าง และพิมพ์/บันทึกเป็น PDF
- **บริษัทผู้ออกเอกสารเปลี่ยนได้เหมือนเปลี่ยนลูกค้า** — หลายนิติบุคคลตั้งแต่แรก
- **สมุดรายรับ-รายจ่าย + กระเป๋าเงิน** พร้อมสรุปรายเดือน
- **ทะเบียนผู้ขาย** (`vendors`) ซึ่งระบบเดิมไม่มีเลย
- **ทะเบียนหมวดหมู่สินค้ากลาง** (`product_categories`) เตรียมรวม 3 ชุดที่เคยแยกกัน

### 33.2 การคำนวณเงิน — ตรวจกับเอกสารจริงแล้ว

`accounting-lib/calc.ts` ทดสอบกับเอกสารจริง 3 ใบก่อนเขียนหน้าจอ:

| เอกสาร | ตรวจอะไร | ผล |
|---|---|---|
| QT202608040006 | ราคารวม VAT + ส่วนลดต่อบรรทัดจนเหลือ 0 | ฐาน 11,214.95 / VAT 785.05 / รวม 12,000 ✓ |
| BL202608060004 | แบ่งชำระ 30% ของสัญญา 2,736,000 | VAT 53,697.20 / รวม 820,800 ✓ |
| INV202608050002 | ราคาแยก VAT + จำนวนเงินเป็นตัวอักษรมีสตางค์ | 128,372 + 7% = 137,358.04 ✓ |

**โหมดราคารวม VAT คิด VAT ก่อนแล้วถอยกลับหาฐาน** ไม่ใช่หารหาฐานก่อน เพื่อให้
`ฐาน + VAT = ยอดรวมทั้งสิ้น` เป๊ะเสมอ (ถ้าหารก่อนแล้วปัด สองตัวจะบวกกันไม่ลงยอดในบางจำนวน —
เอกสารตัวอย่างของ FlowAccount เองก็คลาดกัน 1 สตางค์ที่ใบ BL ด้วยเหตุนี้)

ปัดเศษที่ยอดสรุปเท่านั้น ไม่ปัดทีละบรรทัด

### 33.3 เลขที่เอกสาร

รูปแบบ `{PREFIX}{YYYYMMDD}{NNNN}` เหมือนที่ใช้อยู่เดิม เรียงแยกตาม **บริษัท × ประเภท × วัน**

- ออกเลขด้วยฟังก์ชันฝั่งฐานข้อมูล `next_document_no()` ที่ใช้ `on conflict do update`
  จึงกันสองคนกดพร้อมกันได้จริง ไม่ใช่แค่ล็อกฝั่งหน้าจอ
- **ใบร่างยังไม่กินเลข** ได้เลขตอนกด "ออกเอกสาร"
- ออกเลขแล้วแก้ไม่ได้ ลบไม่ได้ — `deleteArDraft()` ปฏิเสธเอกสารที่มีเลขที่แล้ว
- `seed_document_sequence()` สำหรับตั้งเลขต่อจากระบบเดิมตอนย้ายมา

### 33.4 แช่แข็งข้อมูลในเอกสาร

`company_snapshot` และ `customer_snapshot` เก็บชื่อ ที่อยู่ เลขผู้เสียภาษี สาขา ณ วันที่ออก
ถ้า join สดจากตารางหลัก ลูกค้าย้ายที่อยู่ปีหน้าแล้วใบกำกับเก่าจะพิมพ์ออกมาเป็นที่อยู่ใหม่
ซึ่งไม่ตรงกับใบที่ส่งลูกค้าไปจริง = ผิดกฎหมาย

### 33.5 PDF

ใช้หน้าพิมพ์ A4 + `@media print` แล้วให้เบราว์เซอร์ Save as PDF
เหตุผล: ระบบไม่มี server และ **เบราว์เซอร์จัดวางสระ-วรรณยุกต์ไทยถูกต้องเสมอ**
ต่างจาก library สร้าง PDF ฝั่ง client ที่ต้องทดสอบฟอนต์ก่อนถึงจะไว้ใจได้

พิมพ์ออกมาเป็น **ต้นฉบับ + สำเนา** สองชุดต่อกัน ใบกำกับภาษีมีข้อความ
"ต้นฉบับ (เอกสารออกเป็นชุด)" ตามที่กฎหมายกำหนด

> **ยังไม่ได้ทำ:** ไฟล์ PDF จริงที่แนบอีเมล/เก็บใน Storage ได้ ต้องใช้ `pdfmake` + ฝังฟอนต์ Sarabun
> และ **ต้อง spike ทดสอบภาษาไทยก่อน** แบบเดียวกับที่ทดสอบ TypeScript ก่อน merge

### 33.6 ต่อยอดจากของเดิม ไม่สร้างซ้ำ

ใช้ `users` · `customers` · `projects` · `tickets` · `stock_items` · `purchase_requests` ·
bucket `smart-living-files` · `useQuery` · `useToast` · `RequireRole` ของเดิมทั้งหมด

`comments.entity_type` เพิ่มค่า `'ar_document'` / `'ap_document'` แล้ว →
ทำ flow อนุมัติเอกสารด้วยระบบคอมเมนต์+แจ้งเตือนเดิมได้ ไม่ต้องเขียนใหม่

**FK embed pin ครบ** ตามบทเรียน §7: `ar_documents→users` มี 3 เส้น (sales_user_id,
created_by, approved_by) และ `cash_entries→wallets` มี 2 เส้น — pin ด้วยชื่อ constraint ทั้งหมด

### 33.7 สิทธิ์

เมนูบัญชีและรายรับ-รายจ่ายเปิดให้ **Super Admin / Manager / Admin**
บังคับด้วย RLS `is_accounting_user()` ที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม

Sale มี policy แยกให้สร้างและแก้ **ใบเสนอราคาของตัวเอง** ได้ (`ar_documents_sale_own`)

### 33.8 ยังไม่ได้ทำในรอบนี้

รับชำระเงิน + หัก ณ ที่จ่าย · รายงานลูกหนี้/เจ้าหนี้ · ต้นทุนใน Inventory ·
ตั้งเจ้าหนี้/จ่ายเงิน · ใบลดหนี้/เพิ่มหนี้ · ไฟล์ส่งสำนักงานบัญชี · คอมมิชชั่น · งบประมาณ

ดูลำดับเฟสใน `ACCOUNTING_MODULE_DESIGN_v3.md` §15

## 34. บัญชีรอบ 2 — แก้บั๊กออกเอกสาร, Tag ประเภทงาน, ส่วนลด %, ตัดหน้า PDF (migration 0017)

### 34.1 บั๊กที่ทำให้ "กดออกเอกสารไม่สำเร็จ" และร่างไม่ขึ้นในหน้ารายการ

ทั้งสองอาการมาจากสาเหตุเดียวกัน: `AR_SELECT` embed `projects(id, project_code, project_name)`
แต่ตาราง `projects` จริงใช้ชื่อ **`project_number`** และ **`product_category`** — ไม่มีสองคอลัมน์นั้นเลย

Supabase ตอบ error ทั้ง query ทำให้:
- `listArDocuments()` ล้ม → หน้ารายการว่างเปล่าทั้งที่มีร่างอยู่
- `issueArDocument()` เรียก `getArDocument()` เป็นขั้นแรก → ล้มก่อนถึงการออกเลขที่

แก้เป็น `projects(id, project_number, product_category)` แล้ว

> บทเรียนซ้ำกับ §7: ก่อนเขียน `.select()` ที่มี embed **ต้องเปิดสคีมาจริงมาดูชื่อคอลัมน์**
> ไม่ใช่เดาจากชื่อที่ควรจะเป็น — error ของ Supabase ออกมาเป็น query ล้มทั้งก้อน ไม่ใช่ field เดียวหาย

### 34.2 เลขเอกสารเปลี่ยนเป็นรายเดือน

`{PREFIX}{YYYY}{MM}{NNN}` → **QT202608001** = QT · ปี 2026 · เดือน 08 · ใบที่ 001 ของเดือนนั้น
ยึดตามวันที่ออกจริงของเอกสาร รีเซ็ตลำดับทุกเดือน แยกตามบริษัทและประเภท

เดิมเป็นรายวัน 4 หลัก (`QT202608040006`) — `next_document_no()` และ `seed_document_sequence()`
เขียนทับใน 0017 แล้ว **เอกสารที่ออกเลขไปแล้วไม่กระทบ** เพราะเลขเก็บเป็นข้อความในตัวเอกสาร

### 34.3 Tag ประเภทงาน — เชื่อมทั้งโมดูล

ตาราง `document_tags` (Smart Lock / Hotel Lock / Smart Switch / Plug & Socket /
Construction Product / Service / อื่นๆ) เพิ่มได้ในภายหลัง

- เลือก Tag ที่หัวใบเสนอราคา
- **แปลงเอกสารแล้ว Tag ไหลตามไปด้วย** (`convertArDocument` ยก `tag_id` ไปทุกใบ) —
  ใบแจ้งหนี้ ใบกำกับ ใบเสร็จ จึงอยู่กลุ่มเดียวกับใบเสนอราคาต้นทางเสมอ
- ทุกหน้ารายการเอกสารกรองตาม Tag, จัดกลุ่มตาม Tag, และ**แสดงยอดรวมของกลุ่มที่กรองอยู่**
- การ์ดสรุปยอดต่อ Tag อยู่เหนือตาราง กดแล้วกรองทันที
- Tag พิมพ์ลงบนเอกสารในช่อง "ประเภทงาน"

### 34.4 ส่วนลดเป็นเปอร์เซ็นต์

ปุ่ม `฿ / %` สลับได้รายบรรทัด กรอกเป็น % แล้ว**แสดงจำนวนเงินที่ลดจริงใต้ช่อง**
และสรุปยอดโชว์ "ส่วนลด" กับ "จำนวนเงินหลังหักส่วนลด" เสมอ ไม่ซ่อนเมื่อเป็นศูนย์

`lineDiscount()` แปลง % เป็นบาทตอนบันทึก และ **หักได้ไม่เกินมูลค่าบรรทัด** (ลด 100% = เหลือ 0,
ลดเกินไม่ทำให้ติดลบ) เอกสารที่ออกไปแล้วยอดจึงไม่ขยับตามราคาที่แก้ทีหลัง

### 34.5 ตัดหน้า PDF อัตโนมัติ

`DocumentPrintView` แบ่งรายการเป็นหน้า (หน้าแรก 11 บรรทัด หน้าถัดไป 20) หัวเอกสารซ้ำทุกหน้า
พร้อมเลข "หน้าที่ x/y" สรุปยอดอยู่หน้าสุดท้ายของรายการ และ **หมายเหตุ/เงื่อนไข/ลายเซ็น
ย้ายไปหน้าถัดไปเอง** เมื่อเอกสารยาวหลายหน้าหรือหมายเหตุยาวเกิน 500 ตัวอักษร

### 34.6 ค้นหาสินค้าจากคลังด้วยการพิมพ์

ช่องรายละเอียดมีตัวค้นหาใต้บรรทัด พิมพ์รหัสหรือชื่อแล้วเลือก ระบบเติมชื่อ หน่วย และราคาขายให้
ถ้าไม่เจอจะขึ้นลิงก์ไปหน้า Inventory — สินค้าต้องมีที่เดียว ไม่ใช่พิมพ์ใหม่ทุกใบ

### 34.7 ใบเสนอราคาเป็นฐานของทุกเอกสาร

ใบเสนอราคาที่ออกเลขแล้วมีปุ่ม **สร้างใบแจ้งหนี้** และ **สร้างใบกำกับ/ใบเสร็จ**
ยกลูกค้า รายการ ยอด Tag และเงื่อนไขตามไปทั้งชุด พร้อมผูก `source_document_id`

และหน้าใบเสนอราคาแสดงแถบ **"ออกบิลจากใบนี้ไปแล้ว"** — รวมยอดเอกสารลูกทั้งหมด
เทียบกับยอดใบเสนอราคา คลิกเข้าไปดูแต่ละใบได้

## 35. แก้บั๊กใบเสนอราคาถูกเขียนทับเป็นใบกำกับ + อ้างอิงเอกสารต้นทาง

### 35.1 อาการและสาเหตุ

กด "สร้างใบกำกับ/ใบเสร็จ" จากใบเสนอราคา แล้วบันทึกบนใบใหม่ → **ใบเสนอราคาต้นทาง
กลายเป็นใบกำกับ** (QT202608001 ไปโผล่ในหน้า INV และหายจากหน้า QT)

สาเหตุ: ทุกประเภทเอกสารใช้ route pattern เดียวกัน `/accounting/:docType/:id`
React Router จึง**ไม่ remount** ตอน navigate ข้ามใบ — state ทั้งหมดของหน้าเดิมค้างอยู่
รวมถึง `savedId` ที่ยังชี้ไปใบเสนอราคาใบเดิม พอกดบันทึกบนหน้าใบกำกับ จึงกลายเป็น
`update ar_documents set doc_type='INV' where id = <ใบเสนอราคา>`

### 35.2 การแก้ — 3 ชั้น

1. **Keyed remount**: `DocumentEditorPage` ห่อด้วย `key={docType}:{id}` — เปลี่ยนเอกสาร
   เมื่อไร React สร้างหน้าใหม่ state สะอาดเสมอ ตัดบั๊กตระกูล state ค้างทิ้งทั้งชุด
2. **effect ผูก `savedId` กับ URL** ทุกครั้งที่โหลด (เข็มขัด)
3. **API ป้องกันตัวเอง** (สายเอี๊ยม): `saveArDocument`/`saveApDocument` ตอน update
   - ปฏิเสธเอกสารที่มี `doc_no` แล้ว ("ออกเลขที่แล้ว แก้ไขไม่ได้")
   - ปฏิเสธการเปลี่ยน `doc_type` ของใบเดิมเสมอ และไม่ส่ง `doc_type` ไปกับ update
   ต่อให้หน้าจอพลาดอีกในอนาคต ข้อมูลก็ไม่พัง

**ซ่อมข้อมูลที่พังไปแล้ว**: `FIX_restore_document_types.sql` กู้ `doc_type` กลับจาก
prefix ของเลขเอกสาร (เลขขึ้นต้น QT = ใบเสนอราคาเสมอ) — รันครั้งเดียว รันซ้ำได้

### 35.3 อ้างอิงเอกสารต้นทางแบบ FlowAccount

- ใบที่แปลงมาแสดง **"อ้างอิง QT202608001"** ใต้หัวเรื่อง คลิกกลับไปใบต้นทางได้
  และพิมพ์ลงเอกสารในช่อง "อ้างอิง"
- ใบเสนอราคาเป็นหน้าหลัก: อยู่ในหน้า QT ตลอด ไม่ย้ายไปไหน
  เอกสารลูกแยกเป็นใบของตัวเองพร้อมเลขของตัวเอง
- แถบ "ออกบิลจากใบนี้ไปแล้ว" บนใบเสนอราคาแสดง **ยอดที่ออกแล้ว + ยอดคงเหลือ** —
  รองรับการแบ่งออก 30% แล้วตามด้วย 70%: แปลงครั้งแรกใส่แบ่งชำระ 30 ออกเลขหนึ่งใบ
  แปลงอีกครั้งใส่ 70 ได้อีกใบ เลขคนละใบ อ้างอิงใบเสนอราคาเดียวกัน

## 36. วงจรเงินครบ — รับชำระ ตัดยอดบิล ยกเลิกเอกสาร (migration 0018)

### 36.1 รับชำระเงิน

ปุ่ม **"รับชำระเงิน"** บนใบแจ้งหนี้และใบกำกับที่ออกเลขแล้ว

หน้าจอบังคับให้สมการกระทบยอดลงเสมอ:
```
ยอดที่ตัดหนี้ = เงินเข้าบัญชีจริง + หัก ณ ที่จ่าย + ค่าธรรมเนียมธนาคาร
```
กรอก "ยอดที่ตัด" กับ WHT และค่าธรรมเนียม แล้ว **เงินเข้าจริงคำนวณให้** ไม่ให้กรอกทั้งคู่จนขัดกันเอง
เลือกกระเป๋าเงินได้ → ติ๊กบันทึกเข้าสมุดรายรับ-รายจ่ายอัตโนมัติ (ผูก `ar_document_id` กลับมาที่บิล)

WHT เกิน 0 จะขอ **เลขที่หนังสือรับรองหัก ณ ที่จ่าย** เพราะไม่คีย์ไว้ปลายปีเอาไปเครดิตภาษีไม่ได้

รับบางส่วนได้ รับหลายครั้งได้ ประวัติแสดงใต้เอกสารพร้อมปุ่มลบทีละรายการ

### 36.2 สถานะคำนวณที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ

trigger `ar_allocation_recalc` คำนวณ `paid_amount` และ `status` ใหม่ทุกครั้งที่ยอดตัดเปลี่ยน

| เงื่อนไข | สถานะ |
|---|---|
| `paid >= grand_total` | ชำระครบ |
| `paid > 0` | ชำระบางส่วน |
| ไม่มียอดตัดแต่มีเลขที่แล้ว | ออกแล้ว |

ยกเลิกใบเสร็จแล้วยอดถูกถอนคืน บิลต้นทางจึงกลับไปเป็น "ออกแล้ว" เองโดยไม่ต้องแก้มือ
ทำที่ฐานข้อมูลเพื่อให้ยอดไม่เพี้ยนไม่ว่าจะแก้จากหน้าจอไหน

### 36.3 ออกใบเสร็จ = รับเงินแล้ว

ใบเสร็จ/ใบกำกับออกได้ต่อเมื่อรับเงินแล้ว → ตอนออกเลขที่ ถ้าใบนั้นอ้างอิงใบแจ้งหนี้
ระบบ **ตัดยอดใบแจ้งหนี้ต้นทางให้เป็นชำระแล้วอัตโนมัติ** (`settleSourceBill`)

ตัดได้ไม่เกินยอดที่ยังค้าง — ออกใบเสร็จเกินยอดบิลไม่ทำให้ตัวเลขติดลบ และบิลที่ชำระครบแล้วไม่ถูกตัดซ้ำ

รายการที่ระบบตัดให้จะยังไม่ระบุกระเป๋าเงิน ประวัติการรับชำระจึงขึ้นป้ายเตือน
**"ยังไม่ระบุกระเป๋าเงิน"** ให้กลับมาเติมทีหลัง

### 36.4 ยกเลิกเอกสาร

ปุ่ม **"ยกเลิกเอกสาร"** บนทุกใบที่ออกเลขแล้ว บังคับใส่เหตุผล

- **เลขที่ยังอยู่ในระบบ** นำกลับมาใช้ใหม่ไม่ได้ ตามที่กฎหมายกำหนด
- ยกเลิกใบเสร็จ/ใบกำกับ → ยอดที่เคยตัดกับใบแจ้งหนี้ถูกถอนคืน บิลกลับไปค้างชำระ
- เอกสารที่ยกเลิกแล้วขึ้นแบนเนอร์สีแดง แก้ไขต่อไม่ได้

### 36.5 หน้าใบเสนอราคาแบบ FlowAccount

ตารางแสดงยอดเต็ม และ **ยอดที่วางบิลไปแล้วเป็นตัวเลขเล็กสีชมพูใต้ยอดเต็ม** พร้อมสถานะที่คำนวณสด:

| เงื่อนไข | ป้าย |
|---|---|
| ชำระครบยอดใบเสนอราคา | ชำระแล้ว |
| วางบิลครบแต่ยังไม่ได้เงิน | วางบิลครบ |
| วางบิลบางส่วน | วางบิลบางส่วน |

คิดจาก `billingRollup()` ที่รวมยอดเอกสารลูก (ไม่นับใบที่ยกเลิก) ไม่ได้เก็บเป็นคอลัมน์
เพราะยอดเปลี่ยนตามเอกสารลูกตลอดเวลา — เก็บไว้เมื่อไรก็เพี้ยนเมื่อนั้น

ใบแจ้งหนี้และใบกำกับที่ชำระบางส่วนแสดง "ชำระแล้ว x" ใต้ยอดเช่นกัน

## 37. ลูกโซ่เอกสาร QT → BL → INV พร้อมช่องอ้างอิงและเพดานยอด

### 37.1 ใบเสนอราคาได้เลขตั้งแต่ร่าง

`saveArDocument()` เรียก `next_document_no()` ทันทีที่สร้าง QT ใบใหม่ — ไม่ต้องรอกดออกเอกสาร
จึงอ้างอิงและตามงานได้ตั้งแต่ยังเป็นร่าง

ปุ่มเปลี่ยนจาก "ออกเอกสาร" เป็น **"อนุมัติ"** เพราะเลขมีอยู่แล้ว การกดคือการเปลี่ยนสถานะเท่านั้น

**การล็อกจึงดูที่สถานะ ไม่ใช่ที่การมีเลขที่**: QT แก้ได้ตราบใดที่ยังเป็น `draft`
ส่วน BL/INV/RC ยังคงปิดตายทันทีที่ออกเลข (เอกสารทางภาษี)

### 37.2 รีเซ็ตและลบ

- **รีเซ็ตเป็นร่าง** — ใบเสนอราคาที่อนุมัติแล้วกลับไปแก้ได้
  ถ้าออกใบแจ้งหนี้ไปแล้วจะปฏิเสธพร้อมบอกเลขใบลูกที่ขวางอยู่
- **ลบใบเสนอราคา** — ได้เสมอถ้าไม่มีเอกสารลูก (ไม่ใช่เอกสารทางภาษี เลขขาดได้)
- **ลบใบแจ้งหนี้ / ใบกำกับ** — ได้เฉพาะใบที่ **ยกเลิกแล้ว** เท่านั้น
  `deleteArDocument()` บังคับกฎนี้ที่ API ไม่ใช่แค่ซ่อนปุ่ม

### 37.3 ช่องอ้างอิงแบบค้นหา

`SourceRefPicker` — พิมพ์เลขที่แล้วเลือก แสดงลูกค้า วันที่ และยอดในผลค้นหา

| เอกสาร | อ้างอิง |
|---|---|
| ใบแจ้งหนี้ (BL) | ใบเสนอราคา (QT) |
| ใบกำกับ/ใบเสร็จ (INV/RC) | ใบแจ้งหนี้ (BL) |

เลือกแล้ว `applySource()` ดึงมาทั้งชุด: ลูกค้า · ชื่องาน · ผู้ติดต่อ · ผู้ขาย · Tag ·
รายการสินค้า · โหมด VAT · หมายเหตุ · เงื่อนไข และ **ตั้ง % เรียกเก็บเริ่มต้นให้พอดีกับยอดที่เหลือ**

ตัวเลือกในช่องอ้างอิงกรองเฉพาะใบที่ออกเลขแล้วและยังไม่ถูกยกเลิก

### 37.4 ห้ามวางบิลเกินยอดคงเหลือ

`loadSource()` คืนยอดเต็ม ยอดที่ใช้ไปแล้ว และยอดคงเหลือ (ไม่นับใบที่ยกเลิก)
`handleSave()` ปฏิเสธถ้ายอดเอกสารเกินยอดคงเหลือ พร้อมบอกตัวเลขทั้งสองฝั่ง

ตรวจแล้วกับตัวเลขจริง: QT 2,736,000 → วาง 30% (820,800) → ใบถัดไปตั้ง % ให้เป็น 70 อัตโนมัติ
และวางได้ไม่เกิน 1,915,200 · ใบที่ยกเลิกถูกคืนเข้ายอดคงเหลือ

### 37.5 อื่นๆ ตามที่ขอ

- **หน้าใบเสนอราคาเหลือปุ่ม "สร้างใบแจ้งหนี้" อย่างเดียว** — เอาปุ่มสร้างใบกำกับออก
  เพราะใบกำกับต้องออกต่อจากใบแจ้งหนี้ ไม่ใช่ข้ามมาจากใบเสนอราคา
- **เพิ่ม Tag เองได้** จากในฟอร์ม กดปุ่ม + พิมพ์ชื่อ แล้วเลือกให้อัตโนมัติ
- **ปุ่มลัดหัก ณ ที่จ่าย 3%** ข้างช่องอัตรา (ค่าบริการนิติบุคคล)
- **ตารางประวัติการแบ่งจ่าย** มีคอลัมน์สถานะและยอดชำระแล้ว พร้อมสรุป
  "เรียกเก็บแล้ว / ยังไม่ได้เรียกเก็บ" ด้านบน แบบเดียวกับที่ใช้อยู่เดิม

## 38. ราคาขายในคลังสินค้า + ฟอร์มใบเสนอราคาตามที่ใช้จริง (migration 0019)

### 38.1 บั๊ก: ค้นหาสินค้าแล้วไม่ขึ้นรายการเลย

ตัวค้นหาในหน้าเอกสาร select `sale_price` จาก `stock_items` แต่คอลัมน์นั้นยังไม่เคยถูกสร้าง
Supabase ตอบ error ทั้ง query ผลลัพธ์จึงว่างเปล่าเสมอ

แก้ด้วย migration 0019 เพิ่ม `stock_items.sale_price`

> อาการเดียวกับ §34.1 (`project_code` ที่ไม่มีจริง) — **embed หรือ select คอลัมน์ที่ไม่มี
> ทำให้ query ล้มทั้งก้อน ไม่ใช่แค่ field เดียวหาย** ก่อนเขียน select ต้องเปิดสคีมาดูจริงทุกครั้ง

### 38.2 ราคาขายไหลจาก Sourcing → Inventory → ใบเสนอราคา

```
Sourcing: Suggested selling price (product_costs)
   └─ ตอน Approve แล้วโปรโมตเข้า Inventory → stock_items.sale_price
        └─ ตัวค้นหาในใบเสนอราคาเติมราคาให้อัตโนมัติ
```

- `promoteToInventory()` อ่านประมาณการล่าสุด (`product_costs` เป็น append-only) แล้วพาราคาไปด้วย
- กรณี **adopt สินค้าที่มีอยู่แล้ว** เติมราคาให้เฉพาะเมื่อยังว่าง — ไม่ทับราคาที่คนตั้งไว้เอง
- migration เติมย้อนหลังให้สินค้าที่โปรโมตไปแล้วแต่ยังไม่มีราคา
- หน้า Inventory มีคอลัมน์ **ราคาขาย** และแก้ได้ในฟอร์มแก้ไขสินค้า
- ตัวค้นหาในเอกสารแสดง Model Number · Product Name · ราคาขาย ตรงกับหัวข้อใน Inventory

### 38.3 ฟอร์มเอกสาร

- **"ยืนราคาถึง" → "วันหมดอายุใบเสนอราคา"** ค่าตั้งต้นเป็นวันสุดท้ายของปีปัจจุบัน
- **ช่องที่บังคับกรอก**: ชื่องาน · ประเภทงาน (Tag) · ผู้ติดต่อ · เบอร์โทร · ผู้ขาย (พนักงาน) ·
  วันหมดอายุ (เฉพาะใบเสนอราคา) — ขาดข้อไหนขึ้นชื่อช่องนั้นในข้อความเตือน
- **หัก ณ ที่จ่ายเปลี่ยนเป็นตัวเลือก**: ไม่หัก / 3% ค่าบริการ / 1% ค่าขนส่ง / 5% ค่าเช่า /
  2% ค่าโฆษณา / กำหนดเอง — เพราะขายสินค้าอย่างเดียวไม่ต้องหัก หักได้เฉพาะค่าบริการ

### 38.4 ประเภทงาน (Tag) ย้ายไปหน้าตั้งค่าบริษัท

เพิ่มชนิดใหม่ที่ **บัญชี → ตั้งค่าบริษัท** แบบเดียวกับ Target channels ของ Sourcing
ไม่ให้เพิ่มจากในฟอร์มเอกสารแล้ว เพราะจะเกิดชื่อซ้ำที่สะกดต่างกันจนรายงานรวมยอดไม่ได้

## 39. สมุดรายรับ-รายจ่ายใช้งานได้จริง + ทะเบียนผู้ขาย + ไฟล์ส่งบัญชี (migration 0020)

### 39.1 ทำไมลบและแก้รายการในสมุดไม่ได้ — สองบั๊กซ้อนกัน

**บั๊กที่ 1 — แก้ไขแล้วบันทึกไม่ผ่าน**
กดที่รายละเอียดเพื่อแก้ ระบบส่ง object ทั้งก้อนจากตารางกลับไป `update` ซึ่งรวมช่องที่มาจาก
join (`wallet`, `to_wallet`, `category`, `project`, `vendor`) ที่ไม่ใช่คอลัมน์จริง
Postgres จึงปฏิเสธทั้งคำสั่ง

แก้โดยตัดช่องเหล่านั้นทิ้งก่อน update (`JOINED_FIELDS`)

**บั๊กที่ 2 — ลบไม่ได้และไม่มีข้อความบอก**
`ar_payments.cash_entry_id` อ้าง `cash_entries` โดยไม่ระบุ `ON DELETE` → Postgres ใช้
`NO ACTION` → รายการเงินเข้าที่เกิดจากการรับชำระลบไม่ได้เลย
ซ้ำร้ายปุ่มลบไม่มี try/catch ผู้ใช้จึงเห็นแค่ "กดแล้วไม่มีอะไรเกิดขึ้น"

migration 0020 เปลี่ยนเป็น `ON DELETE SET NULL` — ลบรายการในสมุดได้
ส่วน**ประวัติการรับชำระยังอยู่ครบ** เพราะเป็นหลักฐานทางบัญชี ห้ามหายตามไปด้วย

### 39.2 UX ที่ปรับ

- **ปุ่มแยกตามประเภท**: รับเงิน / จ่ายเงิน / ย้ายโอน แทน dropdown ในฟอร์ม
- **ปุ่มแก้ไข · ทำซ้ำ · ลบ** เห็นชัดทุกแถว (เดิมต้องเดาว่าคลิกที่รายละเอียด)
- **ยืนยันก่อนลบ** พร้อมแสดงรายละเอียดรายการ และ**เตือนเป็นพิเศษ**เมื่อรายการนั้น
  มาจากการรับชำระ พร้อมบอกว่าถ้าอยากยกเลิกการรับเงินจริงๆ ต้องไปลบที่เอกสาร
- **ทุก error มี toast** ไม่มีการกดแล้วเงียบอีก
- **ตัวกรองเพิ่ม**: ประเภท · หมวดหมู่ · ค้นหาข้อความ (เดิมมีแค่ช่วงวันที่กับกระเป๋า)
- **แถวรวมท้ายตาราง** และป้ายบอกที่มา (จากการรับชำระ / VAT / เลขหนังสือรับรอง)
- **ทำซ้ำรายการ** สำหรับค่าใช้จ่ายประจำที่คีย์ทุกเดือน
- ล้างค่าที่ขัดกันเองตอนบันทึก: ย้ายโอนไม่มีหมวดหมู่/VAT/WHT · ไม่ติ๊ก VAT แล้วยอด VAT เป็น 0

### 39.3 ทะเบียนผู้ขาย / ผู้รับเหมา

หน้าใหม่ที่ **บัญชี → ผู้ขาย / ผู้รับเหมา** — เดิมมีแต่ตาราง `vendors` ไม่มีหน้าจอ
ใบสั่งซื้อจึงสร้างได้แต่เลือกผู้ขายไม่ได้ = ใช้ไม่ได้จริง

เก็บเลขประจำตัวผู้เสียภาษี · รหัสสาขา · รูปแบบนิติบุคคล (ตัดสินว่ายื่น ภ.ง.ด.3 หรือ 53) ·
อัตราหัก ณ ที่จ่ายแบบเลือกจากรายการ · เครดิตเทอม · บัญชีธนาคาร

ผู้ขายที่ยังไม่มีเลขผู้เสียภาษีขึ้นป้ายเตือน เพราะออกหนังสือรับรองหัก ณ ที่จ่ายไม่ได้

### 39.4 ไฟล์ส่งสำนักงานบัญชี

**บัญชีคีย์มือ** ไฟล์จึงทำเป็น **Excel เล่มเดียว 5 ชีต หัวคอลัมน์ภาษาไทย** เปิดแล้วคีย์ต่อได้ทันที
ไม่ผูกกับโปรแกรมบัญชียี่ห้อไหน

รายงานภาษีขาย · รายงานภาษีซื้อ · หัก ณ ที่จ่ายที่ถูกหัก · ลูกหนี้คงเหลือแยกอายุหนี้ · รายรับ-รายจ่าย

**ตรวจก่อนสร้างไฟล์** แล้วรายงานปัญหาให้เห็นก่อน:
- ใบกำกับที่ลูกค้าไม่มีเลขผู้เสียภาษี (สีแดง — ลูกค้าขอคืนภาษีซื้อไม่ได้)
- เลขใบกำกับขาดช่วง
- จ่ายเงินแล้วแต่ยังไม่ได้ใบกำกับจากผู้ขาย (ขอคืน VAT ไม่ได้ = เสียเงินจริง)
- รับเงินที่มีหัก ณ ที่จ่ายแต่ไม่ได้คีย์เลขหนังสือรับรอง

หน้าจอสรุป **ภาษีขาย − ภาษีซื้อ = ยอดที่ต้องนำส่ง ภ.พ.30** ให้ดูก่อนดาวน์โหลด

### 39.5 ล้างข้อมูลทดสอบ

`supabase/RESET_accounting_testdata.sql` — ลบเอกสาร/การรับชำระ/รายการในสมุด
แล้วตั้งเลขเอกสารกลับไปเริ่มที่ 001 โดยไม่แตะข้อมูลตั้งค่าและโมดูลอื่น

## 40. หัก ณ ที่จ่ายรายบรรทัด · Tag ลบได้ · ผู้ขายย้ายเข้า Contact (migration 0021)

### 40.1 บั๊ก: บันทึกแล้ว Tag ไม่ขึ้นในหน้ารายการ

`tag_id` ไม่เคยถูกใส่ลงใน payload ตอนบันทึกเลย — หน้าจอเก็บค่าไว้ใน state และแสดงถูกต้อง
แต่ object ที่ส่งไป `saveArDocument()` ไม่มีช่องนี้ ค่าจึงหายทุกครั้งที่กดบันทึก

หน้ารายการอ่านจาก `ar_documents.tag_id` ซึ่งเป็น `null` เสมอ จึงขึ้น "—"
ไม่ใช่เรื่องแหล่งข้อมูลไม่ตรงกันอย่างที่ดูจากอาการ

### 40.2 หัก ณ ที่จ่ายย้ายลงมาที่บรรทัด

**เหตุผลทางกฎหมาย:** หัก ณ ที่จ่ายใช้กับค่าบริการและรับจ้างทำของ **ไม่ใช้กับค่าสินค้า**
บิลของ ARCA ผสมล็อกกับค่าติดตั้งในใบเดียวกันเป็นปกติ การหักทั้งก้อนจึงหักเกินเสมอ

- เพิ่มคอลัมน์ **หัก ณ ที่จ่าย** ในตารางรายการ เลือกได้รายบรรทัด (ไม่หัก / 1 / 2 / 3 / 5%)
- ฐานคิดคือ **มูลค่าก่อน VAT ของบรรทัดนั้น** — โหมดราคารวม VAT จะถอด VAT ออกก่อนเสมอ
- เปลี่ยนประเภทบรรทัดเป็น "สินค้า" ระบบเคลียร์อัตราให้อัตโนมัติ
- ตัวเลือก **"ตั้งหัก ณ ที่จ่ายทุกบรรทัด"** ใส่อัตราให้เฉพาะบรรทัดบริการทีเดียวทั้งใบ
- แบ่งชำระ % ย้ายไปอยู่กรอบของตัวเองทางขวา ไม่ปนกับกลุ่มภาษี

ตรวจแล้วกับตัวเลขจริง: ล็อก 100,000 (สินค้า) + ค่าติดตั้ง 20,000 (บริการ 3%)
→ VAT 8,400 · หัก ณ ที่จ่าย **600 เฉพาะค่าบริการ** · ยอดชำระ 127,800
เคสราคารวม VAT แล้วก็ได้ 600 เท่ากันเพราะถอด VAT ก่อนคิด

เอกสารเก่าที่ตั้งอัตราไว้ที่หัวใบยังคำนวณได้เหมือนเดิม (fallback) และ migration
ย้ายอัตราลงบรรทัดบริการให้อัตโนมัติ

### 40.3 ลบประเภทงาน (Tag) ได้

`deleteDocumentTag()` นับเอกสารที่ใช้ Tag นั้นก่อน — ถ้ามีจะปฏิเสธพร้อมบอกจำนวน
เพราะลบไปแล้วเอกสารเก่าจะไร้ประเภทกะทันหันและรายงานรวมยอดจะเพี้ยน

ปุ่มลบอยู่บนชิปแต่ละอันในหน้าตั้งค่าบริษัท

### 40.4 ฐานข้อมูลคู่ค้าอยู่ที่ Contact ที่เดียว

ย้ายทะเบียนผู้ขายเข้าไปเป็น **แท็บที่ 3 ของ Module Contact** (ลูกค้า · โครงการ · ผู้ขาย/ผู้รับเหมา)
และเอาเมนูออกจากกลุ่มบัญชีแล้ว

`VendorsPanel` แยกออกมาเป็นคอมโพเนนต์ใช้ซ้ำได้ ส่วน route `/accounting/vendors` ยังเปิดอยู่
เผื่อใครบุ๊กมาร์กไว้

## 41. รายการสินค้าในเอกสาร: เลิกใช้ตารางเลื่อนแนวนอน

### 41.1 ทำไมต้องเลื่อนลงถึงจะกดช่องค้นหาได้

ตารางรายการห่อด้วย `overflow-x-auto` เพื่อรองรับ 10 คอลัมน์ที่กว้าง 900px
แต่ตามสเปก CSS **เมื่อแกนหนึ่งเป็น auto อีกแกนที่เป็น `visible` จะกลายเป็น `auto` ไปด้วย**

ผลคือกล่องนั้นตัดทั้งแนวนอนและแนวตั้ง ช่องค้นหาที่อยู่ใต้ textarea จึงถูกดันตกขอบ
และตัวเลือกที่เด้งขึ้นมาก็ถูกตัดหายไปด้วย ต้องเลื่อนสองรอบกว่าจะกดได้

### 41.2 เปลี่ยนเป็นการ์ดต่อบรรทัด

เอาตารางกับ `min-w-[900px]` ออกทั้งหมด แต่ละบรรทัดเป็นการ์ดที่จัดสองชั้น:

```
┌──────────────────────────────────────────────────────┐
│ 1  [🔍 ค้นหาสินค้าจากคลัง……]           มูลค่า  [ลบ] │
│    [รายละเอียด — หลายบรรทัดได้              ]        │
│    ประเภท │ ภาษี │ จำนวน │ หน่วย │ ราคา │ ส่วนลด │ WHT │
└──────────────────────────────────────────────────────┘
```

- **ช่องค้นหาอยู่บนสุด** เป็นทางเข้าหลัก ค้นแล้วระบบเติมชื่อ หน่วย และราคาให้ที่ textarea ข้างล่าง
- เปลี่ยนจาก input เส้นประเล็กๆ เป็นช่องค้นหาเต็มรูปแบบพร้อมไอคอน
- ไม่มี container ที่ตัดขอบแล้ว ตัวเลือกจึงเด้งเต็มความสูงไม่โดนตัด
- ช่องตัวเลขใช้ `flex-wrap` จึงห่อบรรทัดเองเมื่อจอแคบ ไม่ต้องเลื่อนแนวนอนอีก
- มูลค่าของบรรทัดย้ายขึ้นไปอยู่ระดับเดียวกับช่องค้นหา เห็นทันทีโดยไม่ต้องกวาดตาไปสุดขวา

## 42. แสดงที่มาของยอดหัก ณ ที่จ่าย

ผู้ใช้เห็น "หักภาษี ณ ที่จ่าย −2,803.74" แล้วตรวจไม่ได้ว่าถูกหรือผิด เพราะหน้าจอไม่บอก
ว่าคิดจากฐานเท่าไร กี่บรรทัด

`computeTotals()` คืน `whtBase` เพิ่ม (มูลค่าก่อน VAT ของเฉพาะบรรทัดที่ตั้งอัตราหักไว้)
แล้วสรุปยอดแสดงบรรทัดอธิบายใต้ยอดหัก:

> คิดจากมูลค่าก่อน VAT 93,457.94 ของบรรทัดที่ตั้งอัตราหักไว้ · 1 จาก 2 บรรทัด

เอกสารที่พิมพ์ก็มี "(จากมูลค่าก่อนภาษี …)" กำกับ เพื่อให้ลูกค้าตรวจได้เหมือนกัน

**ตัวอย่างจริงที่ตรวจแล้ว** — บิล 200,000 (ราคารวม VAT) แบ่งเป็นสินค้า 100,000 และ
ค่าบริการ 100,000 ตั้งหัก 3% เฉพาะบรรทัดบริการ:

```
100,000 ÷ 1.07 = 93,457.94  → × 3% = 2,803.74   ✓ ตรงกับที่ระบบคำนวณ
```

(ถ้าหักทั้งใบจะได้ 5,607.48 ซึ่งจะเป็นการหักจากค่าสินค้าด้วย = ผิด)

## 42. หน้า Contact จอขาว — และช่องโหว่ที่ทำให้ตรวจไม่เจอตอน build

### 42.1 สาเหตุ

เพิ่มแท็บผู้ขายใน `ContactListPage.jsx` โดยใช้ไอคอน `<Building />` แต่บรรทัด import
มี `Building2` อยู่แล้ว รูปแบบข้อความจึงไม่ตรงกับที่แก้ ทำให้ `Building` ไม่ถูก import

`Building` เป็น `undefined` ตอน render → React โยน error ทั้งต้นไม้ → `<div id="root">` ว่างเปล่า

### 42.2 ทำไม build ผ่านทั้งที่โค้ดพัง

**`npm run typecheck` ตรวจเฉพาะโฟลเดอร์ TypeScript** (`sourcing-*`, `accounting-*`,
`features/sourcing`, `features/accounting`, `features/cashbook`) ตามที่ตั้งไว้ใน `tsconfig.json`
ส่วนไฟล์ `.jsx` ของแพลตฟอร์มเดิมไม่ได้ถูกตรวจเลย

Vite ก็ไม่ error เพราะ `Building` เป็นชื่อที่ถูกต้องทางไวยากรณ์ — รู้ว่าไม่มีค่าก็ตอนรันเท่านั้น

**บทเรียน:** แก้ไฟล์ `.jsx` แล้ว build ผ่าน ไม่ได้แปลว่าใช้ได้
ต้องไล่ดูว่า identifier ที่เพิ่มเข้าไปถูก import จริง

ไล่ตรวจไฟล์ `.jsx` ทั้งโปรเจกต์แล้ว เหลือแต่ false positive
(`Icon` ที่มาจาก destructure prop และ `Route` ในคอมเมนต์)

### 42.3 แสดงที่มาของยอดหัก ณ ที่จ่าย

สรุปยอดบอกแค่ยอดสุทธิ ตรวจไม่ได้ว่าหักจากฐานไหน เพิ่มบรรทัดอธิบายใต้ยอด:

```
หักภาษี ณ ที่จ่าย                    −2,803.74
   คิดจากมูลค่าก่อน VAT 93,457.94 ของบรรทัดที่ตั้งอัตราหักไว้ · 1 จาก 2 บรรทัด
```

`computeTotals()` คืน `whtBase` เพิ่มมา — ยอดหักยังคำนวณเหมือนเดิมทุกประการ
(ตรวจซ้ำกับชุดทดสอบเดิมแล้วผ่านครบ)

## 43. เลขที่ PO · ส่วนลดพิเศษ · สมุดรายจ่ายกลับมาแสดงรายการ + ผลตรวจ workflow (migration 0022)

### 43.1 บั๊ก: สมุดรายรับ-รายจ่ายสรุปยอดมีเลข แต่ตารางว่าง

`ENTRY_SELECT` embed `projects(id, project_code, project_name)` ซึ่งไม่มีจริง
(`projects` ใช้ `project_number` / `product_category`) → query ล้มทั้งก้อน ตารางจึงว่าง

ส่วน `monthlySummary()` ไม่ได้ join projects จึงทำงานปกติ — เป็นเหตุที่สรุปรายเดือนมีตัวเลข
แต่รายการข้างบนไม่มี ซึ่งดูเหมือนสองอย่างขัดกันเอง

**นี่คือบั๊กชนิดเดียวกับ §34.1 และ §38.1 เป็นครั้งที่สาม** จึงไล่ตรวจ embed ทุกจุด
ในโค้ดบัญชีเทียบกับสคีมาจริงทั้งหมดแล้ว — ที่เหลือถูกต้องหมด

### 43.2 ของใหม่ตาม feedback

- **เลขที่ PO ของลูกค้า** (`customer_po_no`) — ใส่ที่ใบเสนอราคา แล้วไหลตามไปใบแจ้งหนี้
  และใบกำกับ ทั้งทางปุ่มแปลงเอกสารและทางช่องอ้างอิง · พิมพ์บนเอกสารในหัวใบ
- **ส่วนลดพิเศษท้ายบิล** คีย์เป็นบาทหรือ % ก็ได้ (ปุ่ม `฿ / %`)
  หักหลังส่วนลดรายบรรทัด แล้ว **ย่อฐานภาษี VAT และหัก ณ ที่จ่ายตามสัดส่วนเดียวกัน**
  ไม่ใช่หักแต่ยอดสุดท้าย — ไม่งั้น VAT ที่นำส่งจะเกินจริง
  หักได้ไม่เกินยอดบิล แสดงทั้งบนหน้าจอและบนเอกสารที่พิมพ์
- **หัวเอกสารเพิ่ม** เลขที่ PO · เลขที่ใบอ้างอิง · **วันที่รับชำระ** (เฉพาะ INV/RC
  ดึงจากการรับชำระล่าสุดจริง ไม่ใช่วันที่ออกเอกสาร — สองอันนี้ต่างกันได้)
- **สมุดรายรับ-รายจ่าย: กดที่รายการเพื่อดูรายละเอียดเต็ม** วันที่ · กระเป๋า/โอนไปไหน ·
  หมวดหมู่ · VAT · WHT + เลขหนังสือรับรอง · โปรเจกต์ · ที่มา แล้วกดแก้ไขต่อได้
- ช่องเลือกลูกค้า/ผู้ขายบอกที่มาว่าดึงจาก Contact และมีลิงก์ไปเพิ่มเมื่อยังไม่มีข้อมูล

### 43.3 ผลตรวจ workflow (audit) — 3 จุดที่ตัวเลขเพี้ยนได้ และแก้แล้ว

**1. ลบการรับชำระ แล้วเงินค้างอยู่ในสมุด**
`deletePayment()` ลบแต่ `ar_payments` ส่วน `cash_entries` ที่สร้างคู่กันตอนรับเงินยังอยู่
→ บิลกลับไปค้างชำระ แต่ยอดกระเป๋าและรายได้รายเดือนยังนับเงินก้อนนั้นอยู่
แก้เป็นลบรายการในสมุดที่ผูกกันไปด้วย

**2. รับชำระเกินยอดค้างได้ ถ้าสองคนกดพร้อมกัน**
เดิมตรวจแค่ที่หน้าจอจากยอดที่โหลดมาตอนเปิดเอกสาร
เพิ่มการตรวจฝั่ง API ที่อ่านยอดค้างสดจากฐานข้อมูล และปฏิเสธการรับชำระบิลที่ยกเลิกแล้ว

**3. วางบิลเกินยอดใบต้นทางได้ ถ้าไม่ผ่านหน้าจอ**
ย้ายการตรวจลงไปที่ `saveArDocument()` ด้วย ครอบคลุมทั้งทางปุ่มแปลงและทางช่องอ้างอิง
และ `convertArDocument()` ตั้ง % เรียกเก็บให้พอดียอดคงเหลือตั้งแต่แรก
(เดิมตั้งเต็มจำนวนแล้วไปชนกฎตอนกดบันทึก)

### 43.4 ชุดทดสอบ workflow

`audit.ts` จำลองทั้งเส้นด้วยตัวเลขงานจริง (2,736,000 ผสมสินค้า+บริการ) ตรวจ 7 หมวด:
ยอดและ WHT ของ QT · แบ่งงวด 30/70 · รับชำระบางส่วนแล้วตัดยอดที่เหลือ ·
ยกเลิกแล้วถอนยอดคืน · สมการกระทบยอด · ส่วนลดพิเศษ · ขายสินค้าล้วนไม่มี WHT

ข้อที่ยืนยันว่าถูก: **WHT ของสองงวดรวมกันเท่ากับ WHT เต็มใบพอดี** และ
**ฐานภาษี + VAT เท่ากับยอดรวมทั้งสิ้นทุกกรณี** รวมถึงกรณีมีส่วนลดพิเศษ

## 44. ออกใบกำกับจากใบแจ้งหนี้ไม่ได้ — สามบั๊กซ้อนกันเรื่องการสืบทอดยอด

อาการ: ใบแจ้งหนี้มีส่วนลดพิเศษ พอกดออกใบกำกับ ยอดไม่ตรงกับใบต้นทาง
แล้วชนกฎห้ามวางเกินยอดคงเหลือ จนออกเอกสารไม่ได้

### 44.1 ช่องอ้างอิงไม่ยกส่วนลดพิเศษมาด้วย

`applySource()` ยกลูกค้า รายการ Tag และ PO มาครบ แต่ลืมส่วนลดพิเศษ
ยอดใบลูกจึงสูงกว่าใบต้นทางตรงๆ ตามจำนวนส่วนลดที่หายไป

### 44.2 สูตร % เรียกเก็บของใบลูกผิดเมื่อใบต้นทางเป็นบิลบางส่วน

**ตัวนี้ร้ายกว่าและยังไม่มีใครเจอ**

`billing_percent` คิดจาก **ยอดรายการ** ไม่ใช่จากยอดของใบต้นทาง
ใบแจ้งหนี้ที่วางไว้ 30% มีรายการเต็มจำนวนอยู่ข้างใน (417,450) แต่ยอดเอกสาร 125,235

สูตรเดิมคิด `pct = คงเหลือ ÷ ยอดใบต้นทาง` ได้ 100 → ใบกำกับลอกรายการไปแล้วตั้ง 100%
**ยอดพองกลับเป็น 417,450 ทันที** เกินใบต้นทางกว่าสามเท่า

สูตรใหม่ `childBillingPercent()` คูณ % ของใบต้นทางเข้าไปด้วย:

| เส้นทาง | ผลลัพธ์ |
|---|---|
| QT (100%) → BL ใบแรก | 100 × 1.0 = **100** |
| QT (100%) → BL ใบสอง หลังวางไป 30% | 100 × 0.7 = **70** |
| BL (30%) → INV เต็มใบ | 30 × 1.0 = **30** ← เดิมได้ 100 จึงพัง |
| BL (30%) → INV ใบสอง หลังออกไปครึ่ง | 30 × 0.5 = **15** |

### 44.3 ส่วนลดพิเศษที่คีย์เป็นบาทถูกลดซ้ำเวลาแตกใบ

เจอตอนเขียนชุดทดสอบเคส BL 30% + ส่วนลด 5,000 แตกเป็นใบกำกับสองใบครึ่งๆ —
ทั้งสองใบลอกส่วนลด 5,000 ไปเต็ม รวมแล้วลดจริง 10,000

`childExtraDiscount()` ย่อส่วนลดที่เป็น**จำนวนเงิน**ตามสัดส่วนที่ใบลูกรับไป
ส่วนที่คีย์เป็น **%** ไม่ต้องย่อ เพราะคิดจากยอดของใบนั้นอยู่แล้ว

### 44.4 ย้ายตัวช่วยไปอยู่ให้ถูกที่

`childBillingPercent` / `childExtraDiscount` เป็นคณิตศาสตร์ล้วน ย้ายจาก
`accounting-api/documents.ts` ไป `accounting-lib/calc.ts` ตามกฎการแบ่งชั้นของโปรเจกต์
(`lib/` ไม่รู้จัก React และไม่ผูกกับฐานข้อมูล) — ผลพลอยได้คือทดสอบได้โดยไม่ต้องมี Supabase

### 44.5 ชุดทดสอบใหม่

`t8.ts` ครอบคลุมทั้งสามบั๊ก และยืนยันสองข้อสำคัญ:
**ยอดใบกำกับเท่ากับยอดใบแจ้งหนี้พอดี** และ **ใบกำกับสองใบรวมกันเท่ากับใบแจ้งหนี้ใบเดียว**
ชุดทดสอบเดิมทั้ง 7 ชุดยังผ่านครบ

## 45. โมดูล On the way — สินค้ากำลังขนส่งเข้ามา (migration 0023)

เมนู **Stock → On the way** เปิดให้ Super Admin / Manager / Store

### 45.1 หลักการที่ยึด เพื่อไม่ให้ขัดกับระบบเดิม

**1. ของที่ยังไม่ถึงไม่นับเป็น `on_hand`**
ไม่แตะ `stock_balances` จนกว่าจะรับเข้าจริง ไม่งั้นจะเบิกของที่ยังไม่มีได้
ซึ่งเป็นความพังที่แพงที่สุดของธุรกิจติดตั้ง (ทีมไปถึงหน้างานแล้วของไม่ครบ)

จำนวนที่กำลังมาแสดงเป็นคอลัมน์ **"กำลังมา"** แยกต่างหากในหน้า Inventory

**2. ตอนรับเข้าใช้ทางเดิมทั้งหมด — ไม่สร้างขาที่สอง**
`receiveShipmentLine()` เรียก `receiveStock()` ตัวเดิม เพิ่มแค่พารามิเตอร์
`referenceType` / `referenceId` ให้ระบุที่มาได้ จึงได้ `stock_transactions`
type `receive_in` และยอด `stock_balances` แบบเดียวกับการรับเข้าคลังปกติเป๊ะ

ถ้าเขียนขาการรับเข้าที่สองแยกไว้ ยอดสองทางจะคำนวณคนละแบบเมื่อไรก็ได้

**3. สถานะคำนวณจากจำนวนที่รับจริงด้วย trigger**
`recalc_shipment_status()` ทำงานทุกครั้งที่บรรทัดเปลี่ยน — คนกดเปลี่ยนสถานะเองไม่ได้
หลักเดียวกับ `recalc_ar_document_paid()` ของฝั่งบัญชี

| เงื่อนไข | สถานะ |
|---|---|
| รับครบทุกบรรทัด | รับเข้าครบแล้ว (+ บันทึกวันที่ถึง) |
| รับไปบ้าง | รับเข้าบางส่วน |
| ยังไม่รับเลย | กำลังขนส่ง |

### 45.2 ล็อตขนส่ง

เลขล็อต `INC{YYYYMM}{NNN}` มีตัวเรียงของตัวเอง (`next_shipment_no`) ไม่ผูกกับเลขเอกสารบัญชี
เพราะล็อตขนส่งไม่ใช่เอกสารของนิติบุคคล — ใช้ on-conflict แบบเดียวกันจึงกันสองคนกดพร้อมกันได้

เก็บ: เลขที่ order สั่งซื้อ · ผู้ขาย · ขนส่งเจ้าไหน · เลขพัสดุ/เลขตู้ ·
**วันที่คาดว่าถึง** · โปรเจกต์ที่ของก้อนนี้เป็นของ · หมายเหตุ · รายการสินค้าพร้อมจำนวน

หน้าจอสรุปด้านบน: ล็อตที่ยังไม่ถึง · จำนวนที่กำลังมา · **ล็อตที่เลยกำหนดถึงแล้ว**
(ล็อตที่เลยกำหนดขึ้นป้ายแดงในรายการด้วย)

### 45.3 รับเข้าคลังด้วยการยิงบาร์โค้ด

ช่องสแกนโฟกัสอัตโนมัติ ยิงแล้วกด Enter ระบบเก็บเป็น serial ทีละชิ้นและนับให้
รับได้หลายรอบจนครบ · สินค้าที่ไม่ต้องยิงบาร์โค้ดใส่เป็นจำนวนได้

**กันความผิดพลาดสามชั้น:**
- **ยิงซ้ำในรอบเดียวกัน** — หน้าจอปฏิเสธทันทีพร้อมบอก serial ที่ซ้ำ
- **serial เคยรับเข้าคลังไปแล้ว** — API เช็คกับ `stock_transactions` ก่อนบันทึก
  (ยิงกล่องเดิมซ้ำทำให้ยอดสต็อกเกินของจริง ซึ่งไปโผล่ตอนนับสต็อกอีกทีนึง)
- **รับเกินจำนวนที่สั่ง** — กันทั้งที่ API และที่ CHECK constraint ระดับฐานข้อมูล

### 45.4 กฎการแก้ไขและยกเลิก

- **แก้รายการได้เฉพาะล็อตที่ยังไม่รับของเลย** — เริ่มรับแล้วแก้ไม่ได้
  เพราะจำนวนที่รับไปแล้วผูกกับ `stock_transactions` ที่เข้าคลังจริงแล้ว
- **ยกเลิกได้เฉพาะล็อตที่ยังไม่มีของเข้าคลัง** — ถ้ารับไปบางส่วนแล้วต้องจัดการผ่านการปรับยอดสต็อก
- **`ON DELETE RESTRICT` บน `stock_item_id`** — ลบสินค้าที่ยังมีของกำลังเดินทางมาไม่ได้
- ห้ามใส่สินค้าซ้ำในล็อตเดียวกัน (รวมเป็นบรรทัดเดียว) ไม่งั้นยอด "กำลังมา" อ่านยาก

### 45.5 ผลตรวจ logic

`t9.ts` จำลอง trigger, view และกฎของ API ครบ 6 หมวด 24 เคส — ผ่านทั้งหมด
ที่ยืนยันชัด: **รับสามรอบ 200+300+260 รวมได้ 760 พอดี ไม่ตกไม่เกิน**
และ **ยอด "กำลังมา" เป็น 0 ทั้งกรณีรับครบและกรณียกเลิก**

ชุดทดสอบเดิมทั้ง 8 ชุดยังผ่านครบ และไล่ตรวจ embed ของโมดูลใหม่เทียบสคีมาจริงแล้ว
