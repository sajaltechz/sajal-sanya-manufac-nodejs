-- Initial migration for Product model

CREATE TABLE "Product" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "baseCost" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_product_updated_at
BEFORE UPDATE ON "Product"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
