// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: any) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // 1. Check if the user is authenticated
        const {
            data: { user },
            error: userError,
        } = await supabaseClient.auth.getUser()

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const { systemId, guestId, password, name, role } = await req.json()

        if (!systemId || !guestId || !password || !name || !role) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 2. Check if the user is the owner of the system
        const { data: system, error: systemError } = await supabaseClient
            .from('systems')
            .select('owner_id')
            .eq('id', systemId)
            .single()

        if (systemError || !system) {
            return new Response(JSON.stringify({ error: 'System not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        if (system.owner_id !== user.id) {
            return new Response(JSON.stringify({ error: 'Only system owner can create members' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 3. Create the user using Supabase Admin API
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Generate a pseudo-email for the user based on guestId
        // Example: guestId@member.thept.co.kr (globally unique)
        const pseudoEmail = `${guestId.toLowerCase()}@member.thept.co.kr`

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: pseudoEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name: name }
        })

        if (authError || !authData.user) {
            if (authError?.message?.includes('already registered')) {
                return new Response(JSON.stringify({ error: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
            return new Response(JSON.stringify({ error: authError?.message || 'Failed to create user' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const newUserId = authData.user.id

        // 4. Update the user's profile which was automatically created by the database trigger
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                full_name: name,
                role: role,
                system_id: systemId
            })
            .eq('id', newUserId)

        if (profileError) {
            // If profile update fails, we might want to delete the user or log it.
            console.error('Profile update failed:', profileError)
        }

        // 5. Add to guest_access table with 'approved' status
        const { error: guestAccessError } = await supabaseAdmin
            .from('guest_access')
            .insert({
                system_id: systemId,
                user_id: newUserId,
                status: 'approved',
                role: role
            })

        if (guestAccessError) {
            console.error('Guest access insert failed:', guestAccessError)
        }

        return new Response(JSON.stringify({ success: true, user: authData.user }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
