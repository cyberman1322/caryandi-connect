"""Generate src/lib/supabase/database.types.ts from a Postgres database that has
the Caryandi migrations applied (the local test DB built by run_tests.sh).
Output follows the same shape as `supabase gen types typescript`, so it can be
swapped for the official generator later without code changes.

Usage: python3 supabase/tests/gen_types.py > src/lib/supabase/database.types.ts
"""
import json, os, subprocess

PSQL = ["psql", "-h", os.environ.get("PGHOST", "/tmp"), "-p", os.environ.get("PGPORT", "5499"),
        "-U", "postgres", "-d", os.environ.get("PGDATABASE", "caryandi_test"), "-X", "-tA"]

def q(sql):
    out = subprocess.run(PSQL + ["-c", f"select coalesce(json_agg(t), '[]') from ({sql}) t"],
                         capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out)

enums = {}
for r in q("""select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
              from pg_type t join pg_enum e on e.enumtypid = t.oid
              join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
              group by t.typname order by t.typname"""):
    enums[r["name"]] = r["labels"]

SCALARS = {
    "uuid": "string", "text": "string", "bpchar": "string", "varchar": "string", "citext": "string",
    "timestamptz": "string", "timestamp": "string", "date": "string", "time": "string",
    "int2": "number", "int4": "number", "int8": "number", "numeric": "number",
    "float4": "number", "float8": "number", "bool": "boolean", "jsonb": "Json", "json": "Json",
}

def ts_type(udt):
    arr = udt.startswith("_")
    base = udt[1:] if arr else udt
    t = f'Database["public"]["Enums"]["{base}"]' if base in enums else SCALARS.get(base, "unknown")
    return f"{t}[]" if arr else t

cols = q("""select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES' as nullable,
                   c.column_default is not null as has_default, c.is_generated = 'ALWAYS' as generated,
                   c.is_identity = 'YES' as identity, t.table_type
            from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public'
            order by c.table_name, c.ordinal_position""")

tables, views = {}, {}
for c in cols:
    (views if c["table_type"] == "VIEW" else tables).setdefault(c["table_name"], []).append(c)

def row_block(columns, indent):
    pad = " " * indent
    lines = []
    for c in columns:
        t = ts_type(c["udt_name"])
        lines.append(f'{pad}{c["column_name"]}: {t}{" | null" if c["nullable"] or c["table_type"] == "VIEW" else ""}')
    return "\n".join(lines)

def insert_block(columns, indent, update=False):
    pad = " " * indent
    lines = []
    for c in columns:
        t = ts_type(c["udt_name"]) + (" | null" if c["nullable"] else "")
        if c["generated"]:
            lines.append(f'{pad}{c["column_name"]}?: never')
        elif update or c["nullable"] or c["has_default"] or c["identity"]:
            lines.append(f'{pad}{c["column_name"]}?: {t}')
        else:
            lines.append(f'{pad}{c["column_name"]}: {t}')
    return "\n".join(lines)

funcs = q("""select p.proname as name,
                    coalesce(p.proargnames, '{}') as argnames,
                    coalesce(p.proargmodes::text[], '{}') as argmodes,
                    (select coalesce(array_agg(format_type(x, null) order by o), '{}')
                       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(x, o)) as argtypes,
                    (select coalesce(array_agg(t.typname order by o), '{}')
                       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(x, o)
                       join pg_type t on t.oid = u.x) as argudts,
                    p.pronargdefaults as ndefaults, p.pronargs as nargs,
                    rt.typname as ret, p.proretset as retset
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             join pg_type rt on rt.oid = p.prorettype
             where n.nspname = 'public' order by p.proname""")

def func_block(f, indent):
    pad = " " * indent
    names, modes, udts = f["argnames"], f["argmodes"], f["argudts"]
    if not modes:
        modes = ["i"] * len(udts)
    ins = [(n, u) for n, m, u in zip(names, modes, udts) if m in ("i", "b")]
    outs = [(n, u) for n, m, u in zip(names, modes, udts) if m in ("o", "b", "t")]
    first_default = len(ins) - f["ndefaults"]
    args = [f'{pad}    {n}{"?" if i >= first_default else ""}: {ts_type(u.lstrip("_") if False else u)}'
            for i, (n, u) in enumerate(ins)]
    if outs:
        ret = "{\n" + "\n".join(f"{pad}    {n}: {ts_type(u)} | null" for n, u in outs) + f"\n{pad}  }}[]"
    elif f["ret"] == "void":
        ret = "undefined"
    else:
        ret = ts_type(f["ret"]) + ("[]" if f["retset"] else "")
    args_s = "{\n" + "\n".join(args) + f"\n{pad}  }}" if args else "Record<PropertyKey, never>"
    return f"{pad}{f['name']}: {{\n{pad}  Args: {args_s}\n{pad}  Returns: {ret}\n{pad}}}"

out = []
out.append("// Generated from the Caryandi database schema by supabase/tests/gen_types.py.")
out.append("// Do not edit by hand. Regenerate after every migration.")
out.append("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]")
out.append("")
out.append("export type Database = {")
out.append("  public: {")
out.append("    Tables: {")
for name, columns in sorted(tables.items()):
    out.append(f"      {name}: {{")
    out.append("        Row: {"); out.append(row_block(columns, 10)); out.append("        }")
    out.append("        Insert: {"); out.append(insert_block(columns, 10)); out.append("        }")
    out.append("        Update: {"); out.append(insert_block(columns, 10, update=True)); out.append("        }")
    out.append("        Relationships: []")
    out.append("      }")
out.append("    }")
out.append("    Views: {")
for name, columns in sorted(views.items()):
    out.append(f"      {name}: {{")
    out.append("        Row: {"); out.append(row_block(columns, 10)); out.append("        }")
    out.append("        Relationships: []")
    out.append("      }")
out.append("    }")
out.append("    Functions: {")
for f in funcs:
    if f["ret"] == "trigger":
        continue
    out.append(func_block(f, 6))
out.append("    }")
out.append("    Enums: {")
for name, labels in enums.items():
    out.append(f"      {name}: " + " | ".join(json.dumps(l) for l in labels))
out.append("    }")
out.append("    CompositeTypes: {")
out.append("      [_ in never]: never")
out.append("    }")
out.append("  }")
out.append("}")
out.append("")
out.append('type PublicSchema = Database["public"]')
out.append('export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]')
out.append('export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]')
out.append('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]')
out.append('export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]')
out.append('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]')
print("\n".join(out))
