-- ─────────────────────────────────────────────────────────────────────────────
-- enterprise-omnichannel — INCREMENTAL migration (fully idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1 ─ FulfillmentMethod enum (guard for partial-run where it was already created)
DO $$ BEGIN
  CREATE TYPE "FulfillmentMethod" AS ENUM ('SHIPPING', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2 ─ Replace OrderStatus enum
--   Must drop the column DEFAULT first (even before the rename), unconditionally,
--   because PostgreSQL checks for casting the default when ALTER COLUMN TYPE runs.
--   DROP DEFAULT is a no-op if there is no default, so this is safe to repeat.
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

-- Rename old type only if it still exists under its original name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OrderStatus' AND typtype = 'e'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OrderStatus_old' AND typtype = 'e'
  ) THEN
    ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
  END IF;
END $$;

-- Create new enum (guard for partial run)
DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('UNPAID', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate column data only if it still uses the old type
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_attribute a
      JOIN pg_class  c ON c.oid = a.attrelid
      JOIN pg_type   t ON t.oid = a.atttypid
     WHERE c.relname = 'Order'
       AND a.attname = 'status'
       AND t.typname = 'OrderStatus_old'
  ) THEN
    ALTER TABLE "Order"
      ALTER COLUMN "status" TYPE "OrderStatus"
      USING (
        CASE status::text
          WHEN 'PENDING'    THEN 'UNPAID'
          WHEN 'PAID'       THEN 'PAID'
          WHEN 'PROCESSING' THEN 'PROCESSING'
          WHEN 'SHIPPED'    THEN 'SHIPPED'
          WHEN 'DELIVERED'  THEN 'COMPLETED'
          WHEN 'CANCELLED'  THEN 'CANCELLED'
          ELSE                   'UNPAID'
        END
      )::"OrderStatus";
  END IF;
END $$;

-- Restore the default using the new enum type
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'UNPAID'::"OrderStatus";

-- Drop old enum if it still exists
DROP TYPE IF EXISTS "OrderStatus_old";

-- Step 3 ─ secureBarcodeToken
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "secureBarcodeToken" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE "Order"
  SET "secureBarcodeToken" = md5(random()::text || clock_timestamp()::text || id::text)
                          || md5(random()::text || id::text || clock_timestamp()::text)
  WHERE "secureBarcodeToken" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "secureBarcodeToken" SET NOT NULL;

DO $$ BEGIN
  CREATE UNIQUE INDEX "Order_secureBarcodeToken_key" ON "Order"("secureBarcodeToken");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Step 4 ─ shippingCost
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "shippingCost" INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 5 ─ fulfillmentMethod
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "fulfillmentMethod" "FulfillmentMethod";
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE "Order" SET "fulfillmentMethod" = 'SHIPPING' WHERE "fulfillmentMethod" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "fulfillmentMethod" SET NOT NULL;

-- Step 6 ─ shippingAddress (nullable JSONB)
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "shippingAddress" JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 7 ─ barcodeUsed flag
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "barcodeUsed" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 8 ─ totalPrice: DOUBLE PRECISION → INTEGER
DO $$ BEGIN
  ALTER TABLE "Order"
    ALTER COLUMN "totalPrice" TYPE INTEGER
    USING round("totalPrice")::integer;
EXCEPTION WHEN cannot_coerce THEN NULL;
       WHEN others THEN NULL;
END $$;

-- Step 9 ─ Drop pointsEarned (safe IF EXISTS)
ALTER TABLE "Order" DROP COLUMN IF EXISTS "pointsEarned";
