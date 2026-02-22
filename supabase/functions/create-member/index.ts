// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
Deno.serve(async (req: Request) => {
    // 1. Handle CORS Preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // 2. Check if the user is authenticated (Owner Request)
        const {
            data: { user },
            error: userError,
        } = await supabaseClient.auth.getUser()

        if (userError || !user) {
            console.error('Auth Error:', userError)
            return new Response(JSON.stringify({ error: 'Unauthorized: 인증되지 않은 접근입니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const body = await req.json().catch(() => null)
        if (!body) {
            return new Response(JSON.stringify({ error: '유효한 JSON 페이로드가 제공되지 않았습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const { systemId, email, password, name, role } = body

        if (!systemId || !email || !password || !name || !role) {
            return new Response(JSON.stringify({ error: '필수 입력 항목이 누락되었습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 3. Check if the user is the owner of the system
        const { data: system, error: systemError } = await supabaseClient
            .from('systems')
            .select('owner_id')
            .eq('id', systemId)
            .single()

        if (systemError || !system) {
            console.error('System fetch error:', systemError)
            return new Response(JSON.stringify({ error: '시스템 정보를 찾을 수 없거나 접근 권한이 없습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        if (system.owner_id !== user.id) {
            return new Response(JSON.stringify({ error: '소유자(원장) 권한이 있는 사용자만 멤버를 추가할 수 있습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 4. Create the User via Supabase Admin API
        const supabaseAdmin = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 실제 이메일 주소로 Supabase Auth 계정 생성
        const memberEmail = email.toLowerCase().trim()

        // 이미 등록된 이메일인지 먼저 확인
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(
            (u: any) => u.email?.toLowerCase() === memberEmail
        )

        if (existingUser) {
            // 이미 다른 시스템에 소속되어 있는지 확인
            const { data: existingMember } = await supabaseAdmin
                .from('system_members')
                .select('system_id')
                .eq('user_id', existingUser.id)
                .eq('status', 'approved')
                .maybeSingle()

            if (existingMember) {
                return new Response(JSON.stringify({
                    error: '이미 다른 시스템에 등록된 이메일입니다. 한 이메일은 하나의 시스템에만 소속될 수 있습니다.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: memberEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name: name }
        })

        if (authError || !authData.user) {
            console.error('Auth creation error:', authError)
            if (authError?.message?.includes('already registered')) {
                return new Response(JSON.stringify({ error: '이미 등록된 이메일입니다. 다른 이메일을 입력해주세요.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
            return new Response(JSON.stringify({ error: authError?.message || '사용자 생성에 실패했습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const newUserId = authData.user.id

        // 5. Explicitly wait/retry to allow Postgres triggers (auth -> profiles) to complete
        // In some cases, updating the profile instantly fails if the trigger hasn't finished.
        // But the trigger should be synchronous. We do it anyway.
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ full_name: name })
            .eq('id', newUserId)

        if (profileError) {
            console.error('Profile update failed:', profileError)
            // It's not a fatal error for auth creation, but good to know
        }

        // 6. Add to system_members table with 'approved' status
        const { error: guestError } = await supabaseAdmin
            .from('system_members')
            .insert({
                system_id: systemId,
                user_id: newUserId,
                status: 'approved',
                role: role
            })

        if (guestError) {
            console.error('Member access insert failed:', guestError)
            return new Response(JSON.stringify({ error: `멤버 권한 테이블 세팅 실패: ${guestError?.message}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        // 7. Success
        return new Response(JSON.stringify({ success: true, user: authData.user }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Catch-all Edge function error:', error)
        return new Response(JSON.stringify({ error: 'Edge Function 내부 예외 발생', details: error?.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
