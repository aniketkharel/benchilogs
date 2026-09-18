# benchilogs

A small offline Windows desktop repair log built with Tauri 2, React, TypeScript, and SQLite, which made my work so much easier. No accounts, remote server, or customer personal-information fields. **(yes it's vibe coded.)**

## Development

Install Bun, Rust, and the Windows Tauri prerequisites (MSVC build tools and WebView2), then run:

```sh
bun install
bun run tauri dev
```

`bun run dev` starts only the browser UI; database operations require the Tauri desktop app. Browser-only use displays a storage message instead of falling back to temporary data.

## Local storage

The first database command creates `benchilogs.sqlite3` in Tauri's application-local data directory. On Windows this is normally:

```text
%LOCALAPPDATA%\com.nick.benchilogs\benchilogs.sqlite3
```

SQLite is bundled with the Rust binary. The installed application requires no network access or separate database installation. Records survive app restarts and updates. Mock records are not seeded or imported.

`src-tauri/src/repairs.rs` owns schema versioning (`PRAGMA user_version`), parameterized SQL, validation, and the four CRUD commands. `src/repairs.ts` provides the typed IPC boundary. The UI changes saved records only after the database confirms success, and keeps the form available if saving fails. Ticket IDs are required but may repeat for return visits. Delete requires confirmation and is permanent.

All repair fields, including diagnosis, work performed, parts, and notes, are persisted. SQLite generates UTC creation/update timestamps; the UI displays them in local time. Creation timestamps are preserved when editing.

- **Dashboard:** records created on the current local day, newest first. The list defaults to Working On; status filters remain selectable. Daily counts cover all statuses created today.
- **Dashboard / All active:** all working, testing, and on-hold records, regardless of date, newest first. The summary cards remain today’s counts.
- **History:** all records, including completed and escalated repairs.
- **Statistics:** current statuses of today's records, independent of search and filters. These are not an event history or a count of status transitions.

Search covers ticket, brand, model, fault, diagnosis, work, parts, and notes. The day refreshes while the app is open and when its window regains focus.

## Verification

```sh
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Database tests cover empty initialization, full-field persistence across reopening a disk database, updates preserving creation time, deletion persisting across reopening, missing records, and invalid input.

Desktop smoke test: create a repair with all fields, restart the app, open it from History, edit its status and notes, restart again, then delete it using the confirmation. Check that search/status filters and daily totals reflect the changes. Failed saves must leave the editor open with an error.

CSV export, timers, backups, and advanced statistics remain future work.
