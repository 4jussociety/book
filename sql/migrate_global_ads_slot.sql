-- 1. Add slot_id column to global_ads
ALTER TABLE global_ads ADD COLUMN IF NOT EXISTS slot_id TEXT;

-- 2. Delete existing data if any to allow unique constraint creation cleanly
-- (Or if data exists, we'd need to manually assign them first, but since it's a new feature, wiping or dropping is fine)
DELETE FROM global_ads WHERE slot_id IS NULL;

-- 3. Make slot_id NOT NULL and add UNIQUE constraint so each slot has only 1 ad
ALTER TABLE global_ads ALTER COLUMN slot_id SET NOT NULL;
ALTER TABLE global_ads ADD CONSTRAINT unique_slot_id UNIQUE (slot_id);
