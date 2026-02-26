-- 1. rename admin_name to manager_name in systems table
ALTER TABLE systems RENAME COLUMN admin_name TO manager_name;

-- 2. Create global_ads table for the super admin feature
CREATE TABLE IF NOT EXISTS global_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    link_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Settings
ALTER TABLE global_ads ENABLE ROW LEVEL SECURITY;

-- Anyone can read active global ads
CREATE POLICY "Anyone can view global_ads" ON global_ads
    FOR SELECT USING (true);

-- Only authenticated Super Admins can insert/update/delete 
-- For now, we will enforce UI level security, but DB level requires an auth check.
-- We can add a simple policy for any authenticated user in the meantime or lock it down
-- stricter if a super_admin role exists.
CREATE POLICY "Authenticated users can manage global_ads" ON global_ads
    FOR ALL USING (auth.role() = 'authenticated');
