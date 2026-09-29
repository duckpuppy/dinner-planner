#!/usr/bin/env bash
# verify-upgrade.sh -- dry-run pending Drizzle migrations against a COPY of the
# production SQLite DB and check that nothing was lost.
#
# Usage:
#   scripts/verify-upgrade.sh [--from-host HOST [--container NAME]] [--db FILE] [--keep] [--force]
#
#   --from-host HOST  take an ONLINE backup (better-sqlite3 .backup) inside the
#                     container on HOST (default container: dinner-planner)
#   --container NAME  container name for --from-host
#   --db FILE         use a local DB file instead (-wal/-shm copied if present)
#   --keep            keep the work dir on PASS (always kept on FAIL)
#   --force           skip the HEAD == origin/testing check only
#
# Exactly one of --from-host / --db is required. The source DB is never modified.
set -euo pipefail

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

HOST=""
CONTAINER="dinner-planner"
SRC_DB=""
KEEP=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-host) HOST="${2:?--from-host needs a value}"; shift 2 ;;
    --container) CONTAINER="${2:?--container needs a value}"; shift 2 ;;
    --db) SRC_DB="${2:?--db needs a value}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -n "$HOST" && -n "$SRC_DB" ]] || [[ -z "$HOST" && -z "$SRC_DB" ]]; then
  echo "Exactly one of --from-host / --db is required." >&2
  usage >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- sqlite3 resolution ------------------------------------------------------
SQLITE="$(command -v sqlite3 || true)"
if [[ -z "$SQLITE" ]]; then
  SQLITE="$(mise which sqlite3 2>/dev/null || true)"
fi
if [[ -z "$SQLITE" || ! -x "$SQLITE" ]]; then
  echo "sqlite3 not found (tried 'command -v sqlite3' and 'mise which sqlite3')." >&2
  exit 2
fi
# -init /dev/null: ignore ~/.sqliterc (headers/timers would corrupt parsing)
sq() { "$SQLITE" -init /dev/null -batch -noheader "$@"; }

# --- state / cleanup ---------------------------------------------------------
REMOTE_TMP_HOST="/tmp/verify-backup-${CONTAINER}.db"
REMOTE_TMP_CONTAINER="/tmp/verify-backup.db"
REMOTE_DIRTY=0
WORK=""
FAILS=()

cleanup_remote() {
  if [[ "$REMOTE_DIRTY" -eq 1 && -n "$HOST" ]]; then
    ssh -o BatchMode=yes "$HOST" \
      "docker exec '$CONTAINER' rm -f '$REMOTE_TMP_CONTAINER'; rm -f '$REMOTE_TMP_HOST'" \
      >/dev/null 2>&1 || echo "WARNING: failed to remove remote temp files ($REMOTE_TMP_CONTAINER in $CONTAINER, $REMOTE_TMP_HOST on $HOST)" >&2
    REMOTE_DIRTY=0
  fi
}
trap cleanup_remote EXIT

fail() { FAILS+=("$1"); echo "  FAIL: $1"; }
ok() { echo "  ok: $1"; }

if [[ -n "$SRC_DB" && ! -f "$SRC_DB" ]]; then
  echo "DB file not found: $SRC_DB" >&2
  exit 2
fi

# --- step 1: git state -------------------------------------------------------
echo "== Step 1: repo state"
if [[ "$FORCE" -eq 0 ]]; then
  git fetch --quiet origin testing
  head_sha="$(git rev-parse HEAD)"
  testing_sha="$(git rev-parse origin/testing)"
  if [[ "$head_sha" != "$testing_sha" ]]; then
    echo "REFUSING: HEAD ($head_sha) != origin/testing ($testing_sha)." >&2
    echo "Check out the commit that will be promoted, or pass --force." >&2
    exit 3
  fi
  ok "HEAD == origin/testing ($head_sha)"
else
  echo "  --force: skipping HEAD == origin/testing check"
fi
dirty="$(git status --porcelain -- apps/api/drizzle apps/api/src/db)"
if [[ -n "$dirty" ]]; then
  echo "REFUSING: uncommitted changes under apps/api/drizzle or apps/api/src/db:" >&2
  echo "$dirty" >&2
  exit 3
fi
ok "no uncommitted changes under apps/api/drizzle or apps/api/src/db"

# --- obtain the copy ---------------------------------------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/verify-upgrade.XXXXXX")"
PRISTINE="$WORK/source.db"   # untouched copy of the source
COPY="$WORK/migrate.db"      # what we migrate
echo "== Work dir: $WORK"

if [[ -n "$HOST" ]]; then
  echo "== Online backup from $HOST (container $CONTAINER)"
  REMOTE_DIRTY=1
  # NB: no single quotes inside; the script is wrapped in single quotes remotely.
  js='const D=require("better-sqlite3");const db=new D("/app/data/dinner.db",{readonly:true,fileMustExist:true});db.backup("'"$REMOTE_TMP_CONTAINER"'").then(()=>{db.close();console.log("backup ok")}).catch(e=>{console.error(e);process.exit(1)})'
  ssh -o BatchMode=yes "$HOST" "docker exec -w /app/apps/api '$CONTAINER' node -e '$js'"
  ssh -o BatchMode=yes "$HOST" "docker cp '$CONTAINER:$REMOTE_TMP_CONTAINER' '$REMOTE_TMP_HOST'"
  scp -o BatchMode=yes -q "$HOST:$REMOTE_TMP_HOST" "$PRISTINE"
  cleanup_remote
else
  echo "== Copying local DB $SRC_DB"
  cp -- "$SRC_DB" "$PRISTINE"
  [[ -f "$SRC_DB-wal" ]] && cp -- "$SRC_DB-wal" "$PRISTINE-wal"
  [[ -f "$SRC_DB-shm" ]] && cp -- "$SRC_DB-shm" "$PRISTINE-shm"
  sq "$PRISTINE" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
fi
cp -- "$PRISTINE" "$COPY"

# --- step 2: integrity + migration bookkeeping (pre) ------------------------
echo "== Step 2: pre-migration integrity"
pre_integrity="$(sq "$COPY" 'PRAGMA integrity_check;')"
if [[ "$pre_integrity" == "ok" ]]; then ok "integrity_check on copy"; else fail "integrity_check on copy: $pre_integrity"; fi
sql_count="$(find apps/api/drizzle -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
pre_applied="$(sq "$COPY" 'SELECT count(*) FROM __drizzle_migrations;')"
echo "  migrations applied: $pre_applied / $sql_count in repo ($((sql_count - pre_applied)) pending)"

# --- step 3: row count snapshot ---------------------------------------------
list_tables() {
  sq "$1" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\_%' ESCAPE '\' AND substr(name,1,9) <> '__drizzle' ORDER BY name;"
}
declare -A PRE POST
while IFS= read -r t; do
  [[ -n "$t" ]] || continue
  PRE["$t"]="$(sq "$COPY" "SELECT count(*) FROM \"$t\";")"
done < <(list_tables "$COPY")
echo "== Step 3: snapshot of ${#PRE[@]} tables"

# --- step 4: migrate ---------------------------------------------------------
echo "== Step 4: migrating copy"
MIGRATE_LOG="$WORK/migrate.log"
set +e
(cd apps/api && DATABASE_URL="file:$COPY" JWT_SECRET="verify-upgrade-dummy-secret-0123456789abcdef" NODE_ENV=production \
  mise exec -- pnpm exec tsx src/db/migrate.ts) >"$MIGRATE_LOG" 2>&1
rc=$?
set -e
if [[ "$rc" -ne 0 ]]; then
  echo "MIGRATION FAILED (exit $rc). Log tail:" >&2
  tail -n 30 "$MIGRATE_LOG" >&2
  echo "RESULT: FAIL -- work dir kept: $WORK" >&2
  exit 1
fi
ok "migration completed (log: $MIGRATE_LOG)"

# --- step 5: checks ----------------------------------------------------------
echo "== Step 5: checks"
echo " -- row counts"
while IFS= read -r t; do
  [[ -n "$t" ]] || continue
  POST["$t"]="$(sq "$COPY" "SELECT count(*) FROM \"$t\";")"
done < <(list_tables "$COPY")
for t in "${!PRE[@]}"; do
  if [[ -z "${POST[$t]+x}" ]]; then
    fail "table $t existed before (${PRE[$t]} rows) but is gone after migration"
  elif [[ "${PRE[$t]}" != "${POST[$t]}" ]]; then
    fail "row count changed for $t: ${PRE[$t]} -> ${POST[$t]}"
  fi
done
for t in "${!POST[@]}"; do
  [[ -z "${PRE[$t]+x}" ]] && echo "  new table: $t (${POST[$t]} rows)"
done
echo "  compared ${#PRE[@]} pre-existing tables"

echo " -- family_id columns"
while IFS= read -r t; do
  [[ -n "$t" ]] || continue
  nulls="$(sq "$COPY" "SELECT count(*) FROM \"$t\" WHERE family_id IS NULL;")"
  dangling="$(sq "$COPY" "SELECT count(*) FROM \"$t\" WHERE family_id IS NOT NULL AND family_id NOT IN (SELECT id FROM families);")"
  notnull="$(sq "$COPY" "SELECT \"notnull\" FROM pragma_table_info('$t') WHERE name='family_id';")"
  msg=""
  [[ "$nulls" -ne 0 ]] && msg+=" nulls=$nulls"
  [[ "$dangling" -ne 0 ]] && msg+=" dangling=$dangling"
  [[ "$notnull" -ne 1 ]] && msg+=" column-not-NOT-NULL"
  if [[ -n "$msg" ]]; then fail "$t.family_id:$msg"; else ok "$t.family_id (0 NULL, 0 dangling, NOT NULL)"; fi
done < <(sq "$COPY" "SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type='table' AND p.name='family_id' ORDER BY m.name;")

echo " -- database integrity"
fk="$(sq "$COPY" 'PRAGMA foreign_key_check;')"
if [[ -z "$fk" ]]; then ok "foreign_key_check clean"; else fail "foreign_key_check violations:"$'\n'"$(echo "$fk" | head -n 20)"; fi
post_integrity="$(sq "$COPY" 'PRAGMA integrity_check;')"
if [[ "$post_integrity" == "ok" ]]; then ok "integrity_check ok"; else fail "integrity_check: $post_integrity"; fi
post_applied="$(sq "$COPY" 'SELECT count(*) FROM __drizzle_migrations;')"
if [[ "$post_applied" -eq "$sql_count" ]]; then ok "all migrations recorded ($post_applied/$sql_count)"; else fail "migrations recorded $post_applied, expected $sql_count"; fi
leftover="$(sq "$COPY" "SELECT name FROM sqlite_master WHERE substr(name,1,6)='__new_';")"
if [[ -z "$leftover" ]]; then ok "no leftover __new_ tables"; else fail "leftover tables: $leftover"; fi

echo " -- informational"
echo "  families (id|name):"
sq "$COPY" 'SELECT id, name FROM families ORDER BY id;' | sed 's/^/    /'
echo "  users (username|role|is_super_admin):"
sq "$COPY" 'SELECT username, role, is_super_admin FROM users ORDER BY username;' | sed 's/^/    /'
echo "  hint: after release, grant a super-admin with:"
echo "    UPDATE users SET is_super_admin = 1 WHERE username = '<you>';"

# --- step 6: summary ---------------------------------------------------------
echo "== Summary"
if [[ "${#FAILS[@]}" -eq 0 ]]; then
  echo "RESULT: PASS"
  if [[ "$KEEP" -eq 1 ]]; then
    echo "work dir kept: $WORK"
  else
    rm -rf -- "$WORK"
  fi
  exit 0
fi
echo "RESULT: FAIL (${#FAILS[@]} problem(s))"
for f in "${FAILS[@]}"; do echo "  - $f"; done
echo "work dir kept: $WORK"
exit 1
