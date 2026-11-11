# Weekly backup to Google Drive (Jon, Nov 11 2026)

Hardening plan H7.3. Jon: "Set up the weekly backup to Google Drive."

**The analogy:** the database is the records room. Once a week a courier (a Google Apps Script
running as Jon) shows a key at the front office, is handed a photocopy of every filing cabinet,
and files the copies in a dated folder in Jon's Drive. The courier can only copy; it can't
change anything in the building.

## What gets saved

Every Sunday between 2 and 3 am, a folder **Bloom backup 2026-11-15 0214** appears inside
**Bloom backups** in Jon's Drive, holding:

- `manifest.json`: every table and how many rows it had;
- one `<table>.ndjson.gz` per table (each row as one line of JSON, compressed);
- `report.txt`: what was saved, and any row count that didn't match.

The newest 8 are kept; older ones go to the Drive trash. A folder still named **INCOMPLETE …**
is a run that stopped partway, and Jon gets an email titled **Bloom backup FAILED**.

**Not in it:** uploaded images and videos (they live in Cloudflare R2, not the database).

**Privacy:** these files hold student records, the same as the database does. Keep the folder
private: don't share it, and don't move it to a shared drive.

## How it works

- Bloom: `GET /api/backup` (`src/app/api/backup/route.ts`) answers only to the header
  `X-Bloom-Backup-Secret`, which must equal the `BLOOM_BACKUP_SECRET` variable in Vercel
  (production only). No variable, no backups. Wrong secrets are throttled.
- Google: `docs/backup/Code.gs`, a stand-alone Apps Script with a weekly trigger.
- The format and the restore are in `src/lib/backup.ts`, tested by restoring a backup into a
  second database and comparing every row (`src/lib/backup.test.ts`).

## Set-up (once, about five minutes)

Do this after the hardening branch is merged and deployed, or the script will say backups
aren't switched on.

1. **Copy the secret.** Vercel → the **bloom** project → Settings → Environment Variables →
   `BLOOM_BACKUP_SECRET` → reveal it and copy the value.
2. **Make the script.** Go to script.google.com → **New project**. Name it "Bloom backup".
   Delete what's in `Code.gs` and paste in all of `docs/backup/Code.gs` from this repository.
3. **Give it the two settings.** Project Settings (the gear) → **Script Properties** → add:
   - `BLOOM_URL` = `https://bloom-iota-six.vercel.app`
   - `BLOOM_BACKUP_SECRET` = the value from step 1
4. **Run `setup`.** Back in the editor, choose the function **setup** and press **Run**.
   Google asks for permission to use Drive, send you email and contact Bloom: allow it.
   It schedules the weekly run and takes the first backup straight away.
5. **Look in Drive.** There should be a **Bloom backups** folder with one dated folder in it,
   and its `report.txt` should say every table matches.

To change the day or how many are kept, edit `DAY`, `HOUR` or `KEEP` at the top of the script
and run `setup` again.

## Getting the data back

A backup is restored into a **new, empty** database, never over the live one.

1. Download one backup folder from Drive and unzip it.
2. Make an empty database (in Neon: a new branch or project) and put its connection string in
   `.env.local` as `DATABASE_URL`.
3. Create the tables, then load the backup:

   ```bash
   npm run db:migrate
   ```

   ```bash
   npx tsx --env-file=.env.local scripts/restore-backup.ts "path/to/Bloom backup 2026-11-15 0214"
   ```

4. It prints each table's row count against the manifest. Point Vercel's `DATABASE_URL` at the
   restored database only once that looks right.

For a mistake made in the last few hours, Neon's own point-in-time restore is quicker; this
backup is for when that window has passed, or Neon itself is the problem.

## Limits worth knowing

- A weekly copy can be up to a week old. Raise the frequency by changing the trigger in `setup`.
- The copy is taken table by table while the app is live, so a row added mid-run can be in one
  table and not another. At 2 am on a Sunday that is unlikely; `report.txt` says if it happened.
- Google stops a script after 6 minutes. If the database grows until a run takes longer, the
  failure email says so, and the fix is to split the run in two.
