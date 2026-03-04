// delete-system: 시스템 전체 삭제 Edge Function
// owner가 호출하면 해당 시스템의 멤버 auth 계정을 삭제(owner 제외)하고, 시스템 자체를 삭제

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
Deno.serve(async (req: Request) => {
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
            return new Response(JSON.stringify({ error: '인증 토큰이 없습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const token = authHeader.replace('Bearer ', '')

        // 1. 인증 확인
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
        if (userError || !user) {
            return new Response(JSON.stringify({ error: '인증되지 않은 접근입니다.', details: userError?.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const body = await req.json().catch(() => null)
        if (!body?.systemId) {
            return new Response(JSON.stringify({ error: 'systemId가 필요합니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const { systemId } = body

        // 2. owner 확인
        const { data: system, error: systemError } = await supabaseClient
            .from('systems')
            .select('owner_id')
            .eq('id', systemId)
            .single()

        if (systemError || !system) {
            return new Response(JSON.stringify({ error: '시스템을 찾을 수 없습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        if (system.owner_id !== user.id) {
            return new Response(JSON.stringify({ error: '소유자만 시스템을 삭제할 수 있습니다.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 3. Admin 클라이언트 생성 (service role key 필요)
        const supabaseAdmin = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 4. 해당 시스템의 멤버 목록 조회 (owner 제외)
        const { data: members, error: membersError } = await supabaseAdmin
            .from('system_members')
            .select('user_id, role')
            .eq('system_id', systemId)
            .neq('role', 'owner')

        if (membersError) {
            console.error('멤버 조회 실패:', membersError)
            return new Response(JSON.stringify({ error: '멤버 목록 조회 실패' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        // 5. 멤버 auth 계정 삭제 (owner 제외)
        const deleteResults = []
        for (const member of (members || [])) {
            try {
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(member.user_id)
                if (deleteError) {
                    console.error(`유저 ${member.user_id} 삭제 실패:`, deleteError)
                    deleteResults.push({ userId: member.user_id, success: false, error: deleteError.message })
                } else {
                    deleteResults.push({ userId: member.user_id, success: true })
                }
            } catch (err: any) {
                console.error(`유저 ${member.user_id} 삭제 예외:`, err)
                deleteResults.push({ userId: member.user_id, success: false, error: err?.message })
            }
        }

        // 5.5 의존 데이터 명시적 순차 삭제 (ON DELETE CASCADE 동작 불확실 대응 + 트리거 충돌 방지)
        // 자식 테이블부터 부모 테이블 순으로 역순 삭제

        const deleteOps = [
            { table: 'appointments', name: '예약' },
            { table: 'client_tickets', name: '고객 이용권' },
            { table: 'clients', name: '고객' },
            { table: 'ticket_packages', name: '이용권 상품 설정' },
            { table: 'message_templates', name: '문자 템플릿' },
            { table: 'pricing_settings', name: '단가 설정' },
            { table: 'system_members', name: '멤버 권한 목록' }
        ]

        for (const op of deleteOps) {
            const { error: delErr } = await supabaseAdmin
                .from(op.table)
                .delete()
                .eq('system_id', systemId)

            if (delErr) {
                console.error(`${op.name}(${op.table}) 삭제 중 오류:`, delErr)
                return new Response(JSON.stringify({ error: `${op.name} 삭제 실패`, details: delErr.message }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500,
                })
            }
        }

        // 6. 시스템 최종 삭제
        const { error: deleteSystemError } = await supabaseAdmin
            .from('systems')
            .delete()
            .eq('id', systemId)

        if (deleteSystemError) {
            console.error('시스템 최종 삭제 실패:', deleteSystemError)
            return new Response(JSON.stringify({ error: '시스템 삭제 실패', details: deleteSystemError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        return new Response(JSON.stringify({
            success: true,
            deletedMembers: deleteResults.length,
            details: deleteResults
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Edge Function 예외:', error)
        return new Response(JSON.stringify({ error: '내부 오류 발생', details: error?.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
