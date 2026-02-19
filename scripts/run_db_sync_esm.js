
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Simple .env parser since we don't have dotenv installed
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8')
        content.split('\n').forEach(line => {
            const [key, ...values] = line.split('=')
            if (key && values.length > 0) {
                const val = values.join('=').trim()
                process.env[key.trim()] = val
            }
        })
    }
}

loadEnv()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Provided by user

if (!supabaseUrl || !secretKey) {
    console.error('Missing credentials')
    process.exit(1)
}

// Extract project ref from URL
// https://ryydxhbpmpcbbvdltazw.supabase.co -> ryydxhbpmpcbbvdltazw
const projectRef = supabaseUrl.split('//')[1].split('.')[0]

async function runMigrations() {
    console.log(`Target Project Ref: ${projectRef}`)
    console.log('Starting DB Synchronization via Management API...')

    const sqlFiles = [
        '2_functions.sql',
        '6_set_visit_count.sql',
        '7_add_revenue_columns.sql',
        '8_update_patient_stats.sql'
    ]

    for (const file of sqlFiles) {
        const filePath = path.join(process.cwd(), 'sql', file)
        if (fs.existsSync(filePath)) {
            console.log(`Reading ${file}...`)
            const sql = fs.readFileSync(filePath, 'utf8')

            // Try Management API Query Endpoint
            // POST https://api.supabase.com/v1/projects/{ref}/query
            const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/query`

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${secretKey}` // Assuming it's a PAT or Management Token
                    },
                    body: JSON.stringify({ query: sql })
                })

                if (!response.ok) {
                    const text = await response.text()
                    console.error(`❌ Failed to execute ${file}: ${response.status}`)
                    console.error('Response:', text)

                    // If 401, maybe it's not a management token but a service role JWT?
                    // If it's a JWT, we can't use this endpoint.
                    // But we can try the pg-meta endpoint if enabled, or just fail.
                } else {
                    console.log(`✅ Successfully executed ${file}`)
                }
            } catch (err) {
                console.error(`Error executing ${file}:`, err)
            }
        }
    }
}

runMigrations()
