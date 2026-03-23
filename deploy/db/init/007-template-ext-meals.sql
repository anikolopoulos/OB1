-- 007-template-ext-meals.sql
-- Brain template extension: meal planning (recipes, meal plans, shopping lists).

-- ── Recipes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.recipes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL,
    cuisine             TEXT,
    prep_time_minutes   INT,
    cook_time_minutes   INT,
    servings            INT,
    ingredients         JSONB       NOT NULL DEFAULT '[]',
    instructions        JSONB       NOT NULL DEFAULT '[]',
    tags                TEXT[],
    rating              INT         CHECK (rating >= 1 AND rating <= 5),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_tags_gin
    ON brain_template.recipes
    USING gin (tags);

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON brain_template.recipes;
CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON brain_template.recipes
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();

-- ── Meal Plans ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.meal_plans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start  DATE        NOT NULL,
    day_of_week TEXT        NOT NULL,
    meal_type   TEXT        NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id   UUID        REFERENCES brain_template.recipes(id) ON DELETE SET NULL,
    custom_meal TEXT,
    servings    INT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start
    ON brain_template.meal_plans (week_start);

-- ── Shopping Lists ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_template.shopping_lists (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start  DATE        NOT NULL,
    items       JSONB       NOT NULL DEFAULT '[]',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_week_start
    ON brain_template.shopping_lists (week_start);

DROP TRIGGER IF EXISTS trg_shopping_lists_updated_at ON brain_template.shopping_lists;
CREATE TRIGGER trg_shopping_lists_updated_at
    BEFORE UPDATE ON brain_template.shopping_lists
    FOR EACH ROW
    EXECUTE FUNCTION brain_template.update_updated_at();
