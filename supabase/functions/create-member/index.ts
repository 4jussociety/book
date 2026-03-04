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
        const authHeader = req.headers.get('Authorization')

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader || '' } } }
        )

        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized: 인증 토큰이 없습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const token = authHeader.replace('Bearer ', '')

        // 2. Check if the user is authenticated (Owner Request)
        const {
            data: { user },
            error: userError,
        } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            console.error('Auth Error:', userError)
            return new Response(JSON.stringify({ error: 'Unauthorized: 인증되지 않은 접근입니다.', details: userError?.message }), {
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
            return new Response(JSON.stringify({ error: '소유자(센터장) 권한이 있는 사용자만 멤버를 추가할 수 있습니다.' }), {
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
        // listUsers() 는 권한/타임아웃 이슈나 대규모 DB에서 401/500 에러를 유발할 수 있으므로,
        // createUser 에러 코드를 확인하거나 안전한 get 방식 사용 권장 (여기서는 DB 뷰를 통해 확인)
        let newUserId = null

        // 1. auth.users 뷰 또는 profiles 접근 (단, profiles 생성 전일수도 있으니 createUser 먼저 시도 후 에러 핸들링하는 로직이 가장 안전합니다.)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: memberEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name: name }
        })

        if (authError) {
            // "User already registered" 에러인 경우 기존 유저 정보 연동 시도
            if (authError.message.includes('already registered')) {
                console.log('User already exists, attempting to relink member:', memberEmail)

                // profiles 테이블에서 이메일로 검색
                const { data: existingUserObj } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('email', memberEmail)
                    .maybeSingle()

                let existingUserId = existingUserObj?.id;

                if (!existingUserId) {
                    // fallback: admin API로 검색
                    const { data: exactUser } = await supabaseAdmin.auth.admin.listUsers()
                    const foundUser = exactUser?.users?.find((u: any) => u.email?.toLowerCase() === memberEmail)
                    if (foundUser) existingUserId = foundUser.id
                }

                if (existingUserId) {
                    // 같은 시스템에 이미 등록되어 있는지만 확인 (다중 시스템 허용)
                    const { data: existingMember } = await supabaseAdmin
                        .from('system_members')
                        .select('system_id')
                        .eq('user_id', existingUserId)
                        .eq('system_id', systemId)
                        .eq('status', 'approved')
                        .maybeSingle()

                    if (existingMember) {
                        return new Response(JSON.stringify({
                            error: '이 멤버는 이미 현재 시스템에 등록되어 있습니다.'
                        }), {
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            status: 400,
                        })
                    }

                    // 기존 계정 재사용 (비밀번호/이름 업데이트)
                    newUserId = existingUserId
                    await supabaseAdmin.auth.admin.updateUserById(newUserId, { password: password, user_metadata: { full_name: name } })
                } else {
                    return new Response(JSON.stringify({ error: '등록된 유저 정보를 DB에서 불러오는 데 문제가 발생했습니다.' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 500,
                    })
                }

            } else {
                console.error('Auth creation error:', authError)
                return new Response(JSON.stringify({ error: authError?.message || '사용자 생성에 실패했습니다.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
        } else if (authData?.user) {
            // 새 계정 생성 성공
            newUserId = authData.user.id
        } else {
            return new Response(JSON.stringify({ error: '사용자 생성 응답 형식이 올바르지 않습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

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
        return new Response(JSON.stringify({ success: true, user: { id: newUserId } }), {
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
