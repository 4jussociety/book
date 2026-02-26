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

        const { systemId, targetUserId, newPassword } = body

        if (!systemId || !targetUserId || !newPassword) {
            return new Response(JSON.stringify({ error: '필수 입력 항목이 누락되었습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        if (newPassword.length < 6) {
            return new Response(JSON.stringify({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }), {
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
            return new Response(JSON.stringify({ error: '소유자(센터장) 권한이 있는 사용자만 멤버의 비밀번호를 변경할 수 있습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 4. Update the User via Supabase Admin API
        const supabaseAdmin = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 대상 멤버가 해당 시스템 소속인지 검증 (선택적 보안 강화)
        const { data: targetMemberInfo, error: targetMemberError } = await supabaseAdmin
            .from('system_members')
            .select('id')
            .eq('system_id', systemId)
            .eq('user_id', targetUserId)
            .single()

        if (targetMemberError || !targetMemberInfo) {
            return new Response(JSON.stringify({ error: '해당 멤버가 시스템에 존재하지 않습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        // 비밀번호 업데이트
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            { password: newPassword }
        )

        if (updateError) {
            console.error('Password update error:', updateError)
            return new Response(JSON.stringify({ error: `비밀번호 변경에 실패했습니다: ${updateError.message}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        // 5. Return success
        return new Response(JSON.stringify({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (err: any) {
        console.error('Unexpected function error:', err)
        return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
