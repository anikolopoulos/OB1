-- 010-clone-function.sql
-- Public function to clone the brain_template schema (or any source schema)
-- into a new target schema, including tables, functions, and triggers.

CREATE OR REPLACE FUNCTION public.clone_brain_schema(
    source_schema TEXT,
    target_schema TEXT
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    tbl       RECORD;
    func      RECORD;
    trg       RECORD;
    fk        RECORD;
    func_def  TEXT;
    trg_def   TEXT;
BEGIN
    -- 1. Create the target schema
    EXECUTE format('CREATE SCHEMA %I', target_schema);

    -- 2. Clone every table (structure, defaults, CHECK constraints, indexes).
    --    INCLUDING ALL does NOT copy foreign keys or triggers; steps 4-5 handle those.
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = source_schema
        ORDER BY tablename
    LOOP
        EXECUTE format(
            'CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL)',
            target_schema, tbl.tablename,
            source_schema, tbl.tablename
        );
    END LOOP;

    -- 3. Clone every function, rewriting schema references in the body
    FOR func IN
        SELECT p.oid,
               p.proname,
               pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = source_schema
    LOOP
        -- Replace unquoted schema references in the function body
        func_def := replace(func.definition, source_schema || '.', target_schema || '.');
        -- Replace quoted schema references in the CREATE FUNCTION header
        func_def := replace(func_def,
            format('%I.%I', source_schema, func.proname),
            format('%I.%I', target_schema, func.proname)
        );
        EXECUTE func_def;
    END LOOP;

    -- 4. Clone every user-defined trigger, rewriting schema references
    FOR trg IN
        SELECT t.tgname,
               c.relname AS tablename,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = source_schema
          AND NOT t.tgisinternal
    LOOP
        trg_def := trg.definition;
        -- Replace unquoted schema references (e.g. brain_template.thoughts)
        trg_def := replace(trg_def, source_schema || '.', target_schema || '.');
        -- Replace quoted schema references (e.g. "brain_template".thoughts)
        trg_def := replace(trg_def,
            format('%I.', source_schema),
            format('%I.', target_schema)
        );
        EXECUTE trg_def;
    END LOOP;

    -- 5. Re-create single-column foreign key constraints.
    --    NOTE: multi-column FKs would require grouping by constraint_name;
    --    all current template tables use single-column FKs only.
    FOR fk IN
        SELECT
            tc.table_name AS src_table,
            kcu.column_name AS src_column,
            ccu.table_name AS ref_table,
            ccu.column_name AS ref_column,
            tc.constraint_name,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.constraint_schema = tc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.constraint_schema = tc.constraint_schema
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
           AND rc.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.constraint_schema = source_schema
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE %s',
            target_schema, fk.src_table,
            fk.constraint_name,
            fk.src_column,
            target_schema, fk.ref_table,
            fk.ref_column,
            fk.delete_rule
        );
    END LOOP;
END;
$$;
