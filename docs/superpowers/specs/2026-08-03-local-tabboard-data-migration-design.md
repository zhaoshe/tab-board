# Local `.TabBoard` Data Migration Design

## Goal

Convert `/Users/zhaoshe/.TabBoard` to the current TabBoard file schema without
losing or re-identifying user data.

The current-code normalization dry run found exactly one schema change:

- Add `emoji: "🗂️"` to workspace `workspace_default`.

The migration must preserve:

- 1 workspace;
- 4 sessions;
- 37 tabs;
- 8 drop-operation ledger entries;
- all IDs, URLs, titles, notes, timestamps, settings, and mutation revision;
- the existing per-session filenames.

## Source And Destination

- Source and final destination: `/Users/zhaoshe/.TabBoard`.
- Backup: `/Users/zhaoshe/.TabBoard.backup-YYYYMMDD-HHMMSS`.
- The backup must be created and verified before the source is modified.
- Existing backup directories must never be overwritten.

## Migration Flow

1. Refuse to run if the source directory or required files are missing.
2. Read and parse every top-level JSON file and every `sessions/*.json` file.
3. Assemble the current state and run the repository's `normalizeState()`.
4. Verify the normalized state preserves the audited object counts and IDs.
5. Copy the complete source directory to the timestamped backup.
6. Verify the backup file inventory and SHA-256 digest match the source.
7. Write the normalized `workspaces.json` to a temporary sibling file.
8. Parse and validate the temporary file, then atomically rename it over
   `workspaces.json`.
9. Re-read the full source directory and run the current assembler/normalizer.
10. Verify the final directory has the same IDs, counts, timestamps, settings,
    revision, and content digests except for the added workspace emoji.

Only `workspaces.json` may change. The migration must not rewrite session,
settings, metadata, category-order, bin, or ledger files.

## Safety And Rollback

- The source is never deleted.
- A failed backup verification stops before any source write.
- A failed temporary-file validation leaves the source untouched.
- A failed post-write verification restores `workspaces.json` from the backup
  and verifies the restored digest.
- The backup remains after successful migration for manual rollback.

## Verification

The migration report must include:

- backup path;
- source and backup file counts;
- source/backup SHA-256 inventory match;
- before/after counts for workspaces, sessions, tabs, folders, bin, and ledger;
- unchanged mutation revision and timestamps;
- unchanged session and tab ID sets;
- exact changed field list;
- a final current-schema read result.

Expected changed field list:

```text
workspaces[workspace_default].emoji: <missing> -> "🗂️"
```

## Out Of Scope

- Merging with Chrome browser storage.
- Changing session/category organization.
- Removing cross-session duplicate URLs.
- Updating timestamps or mutation revision.
- Changing the current File System Access API folder selection.
