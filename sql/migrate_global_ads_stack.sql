-- 1. Drop the UNIQUE constraint on slot_id to allow multiple ads per slot
ALTER TABLE global_ads DROP CONSTRAINT IF EXISTS unique_slot_id;

-- 2. Add sort_order column to control the stack vertical arrangement
ALTER TABLE global_ads ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
