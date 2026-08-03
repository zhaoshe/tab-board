# Local `.TabBoard` Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back up `/Users/zhaoshe/.TabBoard`, add the current workspace emoji field, and prove that no other user data changed.

**Architecture:** Treat the existing directory as immutable input until a complete timestamped backup has been copied and verified by a sorted SHA-256 inventory. Use the repository's current `normalizeState()` for the dry run and final read, but atomically replace only `workspaces.json`. Any failed post-write check restores that file from the verified backup.

**Tech Stack:** POSIX shell, `jq`, `shasum`, Node.js, Vite module loader, TabBoard `normalizeState()`.

## Global Constraints

- Source and destination are `/Users/zhaoshe/.TabBoard`.
- Backup is `/Users/zhaoshe/.TabBoard.backup-YYYYMMDD-HHMMSS`.
- Preserve all IDs, URLs, titles, notes, settings, timestamps, and `mutationRevision`.
- Preserve 1 workspace, 4 sessions, 37 tabs, 0 folders, 0 bin entries, and 8 ledger entries.
- Only `workspaces.json` may change.
- The only allowed semantic change is `workspace_default.emoji: <missing> -> "🗂️"`.
- Never overwrite an existing backup.
- Stop before writing if the source changes while the backup is being created.

---

### Task 1: Capture And Validate The Source

**Files:**
- Read: `/Users/zhaoshe/.TabBoard/**/*.json`
- Create temporarily: `/tmp/tabboard-migration-*/before.sha256`
- Create temporarily: `/tmp/tabboard-migration-*/normalized-workspaces.json`

**Interfaces:**
- Consumes: current file layout and repository `normalizeState(raw: unknown): TabBoardState`
- Produces: a source SHA-256 inventory, normalized workspace file, and before-state manifest

- [ ] **Step 1: Create a private staging directory**

Run:

```sh
umask 077
STAGE="$(mktemp -d /tmp/tabboard-migration-XXXXXX)"
```

Expected: a new mode-700 staging directory.

- [ ] **Step 2: Generate the sorted source inventory**

Run from `/Users/zhaoshe/.TabBoard`:

```sh
find . -type f -print0 | sort -z | xargs -0 shasum -a 256 > "$STAGE/before.sha256"
```

Expected: 11 entries.

- [ ] **Step 3: Assemble and normalize the old data in memory**

Use a Node/Vite script to read all top-level files and sessions, call current `normalizeState()`, and write only the normalized workspace array to:

```text
$STAGE/normalized-workspaces.json
```

Expected before/after counts:

```json
{"workspaces":1,"folders":0,"sessions":4,"tabs":37,"bin":0,"ledger":8}
```

Expected change list:

```text
workspaces[workspace_default].emoji: <missing> -> "🗂️"
```

### Task 2: Create And Verify The Backup

**Files:**
- Create: `/Users/zhaoshe/.TabBoard.backup-YYYYMMDD-HHMMSS/**`
- Create temporarily: `/tmp/tabboard-migration-*/after-copy-source.sha256`
- Create temporarily: `/tmp/tabboard-migration-*/backup.sha256`

**Interfaces:**
- Consumes: source inventory from Task 1
- Produces: a complete immutable rollback directory

- [ ] **Step 1: Choose a non-existing timestamped backup path**

Run:

```sh
BACKUP="/Users/zhaoshe/.TabBoard.backup-$(date +%Y%m%d-%H%M%S)"
test ! -e "$BACKUP"
```

- [ ] **Step 2: Copy the complete source**

Run:

```sh
cp -a /Users/zhaoshe/.TabBoard "$BACKUP"
```

- [ ] **Step 3: Verify source stability and backup identity**

Regenerate sorted inventories for source and backup. Strip only the different absolute directory prefix before comparison.

Expected:

- source inventory before copy equals source inventory after copy;
- backup inventory equals source inventory;
- all three contain 11 entries.

If the source changed during copy, remove the incomplete backup and stop without modifying the source.

### Task 3: Atomically Replace `workspaces.json`

**Files:**
- Modify: `/Users/zhaoshe/.TabBoard/workspaces.json`
- Create temporarily: `/Users/zhaoshe/.TabBoard/.workspaces.json.migration.tmp`

**Interfaces:**
- Consumes: verified backup and normalized workspace array
- Produces: current-schema `workspaces.json`

- [ ] **Step 1: Copy the staged JSON to the source directory**

Run:

```sh
cp "$STAGE/normalized-workspaces.json" \
  /Users/zhaoshe/.TabBoard/.workspaces.json.migration.tmp
```

- [ ] **Step 2: Parse and validate the temporary file**

Run:

```sh
jq -e '
  length == 1
  and .[0].id == "workspace_default"
  and .[0].emoji == "🗂️"
' /Users/zhaoshe/.TabBoard/.workspaces.json.migration.tmp
```

- [ ] **Step 3: Atomically rename over the old file**

Run:

```sh
mv /Users/zhaoshe/.TabBoard/.workspaces.json.migration.tmp \
  /Users/zhaoshe/.TabBoard/workspaces.json
```

### Task 4: Verify And Report

**Files:**
- Read: `/Users/zhaoshe/.TabBoard/**/*.json`
- Read: verified backup

**Interfaces:**
- Consumes: migrated directory and backup
- Produces: final migration report

- [ ] **Step 1: Re-run current-schema assembly and normalization**

Expected:

```json
{"workspaces":1,"folders":0,"sessions":4,"tabs":37,"bin":0,"ledger":8}
```

- [ ] **Step 2: Compare source against backup**

Expected:

- only `workspaces.json` has a different SHA-256 digest;
- the only JSON semantic difference is the workspace emoji;
- `meta.json` revision and timestamps are unchanged;
- session filenames, session IDs, and tab IDs are unchanged.

- [ ] **Step 3: Roll back automatically on any mismatch**

Run:

```sh
cp "$BACKUP/workspaces.json" /Users/zhaoshe/.TabBoard/.workspaces.json.rollback.tmp
mv /Users/zhaoshe/.TabBoard/.workspaces.json.rollback.tmp \
  /Users/zhaoshe/.TabBoard/workspaces.json
```

Then verify the restored source inventory equals the backup inventory.

- [ ] **Step 4: Keep the verified backup and remove staging**

The backup remains. Remove only the private `/tmp/tabboard-migration-*` staging directory after all evidence has been captured.
