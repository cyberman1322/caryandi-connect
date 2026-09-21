#!/bin/bash
# Applies every migration to a throwaway local Postgres (with a Supabase shim)
# and runs the security scenario tests. Never point this at the real project.
# Needs: a local Postgres 15+ reachable as  psql -h $PGHOST -p $PGPORT -U postgres
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5499}
P="psql -U postgres -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists caryandi_test" -c "create database caryandi_test" >/dev/null
$P -d caryandi_test -f "$HERE/supabase_shim.sql" >/dev/null 2>&1
for f in "$HERE"/../migrations/*.sql; do $P -d caryandi_test -1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }; done
echo "migrations applied"
python3 "$HERE/rls_tests.py"
