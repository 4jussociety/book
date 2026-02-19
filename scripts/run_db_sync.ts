
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Load env
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function runMigrations() {
    console.log('Starting DB Synchronization...')

    // List of SQL files to run in order
    // Note: We are assuming these are idempotent (create if not exists, replace function, etc.)
    const sqlFiles = [
        '2_functions.sql', // Usually contains helper functions
        '6_set_visit_count.sql', // Triggers for appointments
        '7_add_revenue_columns.sql', // Alter tables for revenue
        '8_update_patient_stats.sql' // Triggers for patient stats
    ]

    for (const file of sqlFiles) {
        const filePath = path.join(process.cwd(), 'sql', file)
        if (fs.existsSync(filePath)) {
            console.log(`Running ${file}...`)
            const sql = fs.readFileSync(filePath, 'utf8')

            // Execute SQL using a raw RPC call if available, or we might utilize the pg driver if we had it.
            // Since we only have supabase-js, we need a way to run raw SQL.
            // Standard supabase-js doesn't expose raw SQL execution for security, 
            // BUT the 'service_role' key allows admin access. 
            // However, there's no public endpoint for raw SQL unless we use the 'pg' library with connection string.
            // The connection string is usually not exposed in the dashboard explicitly for JS client, 
            // but we can try to use the REST API 'rpc' if we have a function to run sql (which we don't yet).

            // WAIT. If we don't have a way to run SQL, how can we do this?
            // The user provided the "secret key".
            // If we cannot connect via `pg`, we are stuck.
            // BUT, many Supabase projects have a built-in `exec_sql` function or similar IF using certain starters, but not standard.

            // Let's try to find a workaround. 
            // Actually, for this specific environment, we might not be able to run raw SQL via `supabase-js`.
            // However, since the user gave us the key, maybe they expect us to use it.
            // If we had the postgres connection string, we could use `pg`.
            // `postgres://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`
            // We don't have the password.

            // Alternative: use the Management API? Supabase Management API requires an access token (not service role key).

            // Let's TRY to see if we can use the `rpc` interface to call a function that might exist? 
            // Or maybe we can't.

            // If I cannot run SQL, I will failed.
            // But wait, I can use the `supabase` CLI if installed?
            // `npx supabase db reset`? No.

            // Okay, I will try to use a little trick. 
            // Sometimes `invoke` can be used if there's an edge function.

            // Let's look at the `package.json`. It has `@supabase/supabase-js`.
            // There is no `pg` driver.

            // This suggests I CANNOT run raw SQL from this environment unless I have a specific function set up.
            // BUT the user asked me to "clean up using the key".
            // Maybe I can't.

            // Let's double check if I can use the REST API to run SQL.
            // https://supabase.com/docs/guides/api/sql NOT available over REST by default.

            // Re-evaluating. User gave `sb_secret_...`
            // Is this an "Access Token" for the Management API?
            // Management API can run SQL.
            // `https://api.supabase.com/v1/projects/{ref}/sql`
            // The ref is `ryydxhbpmpcbbvdltazw` (from URL).
            // Let's try to use the Management API with the provided key.

            const projectRef = 'ryydxhbpmpcbbvdltazw'
            const managementApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/query`

            // The key provided `sb_secret_...` MIGHT be a Personal Access Token (PAT).
            // PATs usually start with `sbp_` or just random.
            // Let's try to hit the Management API.

            try {
                const response = await fetch(managementApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${serviceRoleKey}`
                    },
                    body: JSON.stringify({ query: sql })
                })

                if (!response.ok) {
                    // Try another endpoint or method?
                    // Maybe it's not a PAT. 
                    // If it's a Service Role Key, it won't work on Management API.
                    console.error(`Failed to execute ${file}: ${response.status} ${response.statusText}`)
                    const text = await response.text()
                    console.error('Response:', text)
                } else {
                    console.log(`Successfully executed ${file}`)
                }
            } catch (err) {
                console.error(`Error executing ${file}:`, err)
            }
        }
    }
}

runMigrations().catch(console.error)
