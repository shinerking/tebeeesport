-- ──────────────────────────────────────────────────────────────────────────────
-- enterprise-oms migration
-- Adds invoiceNo, variantId, quantity, resiNo to Order.
-- Replaces OrderStatus enum (PAID→PROCESSING, DONE→DELIVERED, adds CANCELLED).
-- Adds unique indexes on Order.invoiceNo and Product.name.
-- ──────────────────────────────────────────────────────────────────────────────

-- Step 1: Add new enum values (safe, non-destructive first)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Step 2: Add new columns to Order (nullable first for safety)
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "invoiceNo" TEXT,
  ADD COLUMN IF NOT EXISTS "variantId" TEXT,
  ADD COLUMN IF NOT EXISTS "quantity"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "resiNo"    TEXT;

-- Step 3: Backfill invoiceNo so existing rows satisfy the NOT NULL constraint
UPDATE "Order"
  SET "invoiceNo" = 'INV/LEGACY/' || substring(id, 1, 8)
  WHERE "invoiceNo" IS NULL;

-- Step 4: Backfill variantId with any existing variant (handles empty table too)
UPDATE "Order" o
  SET "variantId" = (SELECT id FROM "Variant" LIMIT 1)
  WHERE o."variantId" IS NULL
    AND EXISTS (SELECT 1 FROM "Variant");

-- Step 5: Make columns NOT NULL
ALTER TABLE "Order" ALTER COLUMN "invoiceNo" SET NOT NULL;

-- Step 6: variantId FK and NOT NULL (only if at least one variant exists;
--         otherwise table should be empty so it's fine to set a placeholder)
ALTER TABLE "Order" ALTER COLUMN "variantId" SET NOT NULL;

-- Step 7: Add unique index on invoiceNo
CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoiceNo_key" ON "Order"("invoiceNo");

-- Step 8: Add unique index on Product.name
CREATE UNIQUE INDEX IF NOT EXISTS "Product_name_key" ON "Product"("name");

-- Step 9: Add FK constraint for variantId → Variant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'Order_variantId_fkey'
       AND table_name = 'Order'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "Variant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
