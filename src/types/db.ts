// 데이터베이스 테이블 타입 정의
// 각 테이블의 TypeScript 인터페이스와 런타임 확장 속성을 관리

export type Profile = {
    id: string
    email?: string
    name?: string
    full_name: string
    phone?: string
    color_code?: string
    created_at?: string
    avatar_url?: string

    // DB에는 없지만 Context에서 조인/주입되어 사용되는 런타임 속성
    system_id?: string | null
    role?: 'owner' | 'staff' | 'therapist' | 'pending_admin'
    is_owner?: boolean
    organization_name?: string
    contact_number?: string
    admin_name?: string
    incentive_percentage?: number // 0~100

    // 기능별 테이블에서 조인되는 런타임 속성
    pricing?: PricingSetting[]
    message_template?: string  // 기본 템플릿 body (편의 속성)
}

export type System = {
    id: string
    name: string
    owner_id: string
    created_at: string
    organization_name: string | null
    contact_number: string | null
    admin_name: string | null
    last_patient_no: number
}

export type PricingSetting = {
    id: string
    system_id: string
    duration_minutes: number
    price: number
    created_at: string
    updated_at: string
}

export type MessageTemplate = {
    id: string
    system_id: string
    template_name: string
    template_body: string
    is_default: boolean
    created_at: string
    updated_at: string
}

export type Patient = {
    id: string
    patient_no: number
    is_manual_no?: boolean
    name: string
    gender: 'MALE' | 'FEMALE' | 'M' | 'F'
    birth_date: string | null
    phone: string | null
    memo: string | null
    visit_count: number
    last_visit: string | null
    system_id: string | null
    created_at: string
}

export type AppointmentStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'NOSHOW'
export type EventType = 'APPOINTMENT' | 'BLOCK'

export type Appointment = {
    id: string
    event_type: EventType
    therapist_id: string
    patient_id: string | null
    start_time: string
    end_time: string
    status: AppointmentStatus
    visit_count: number | null
    note: string | null
    block_title: string | null
    block_memo: string | null
    version: number
    system_id: string | null
    created_at: string
    price?: number // 예상 결제 금액 (원)
    // Joins
    patient?: Patient
    therapist?: Profile
}

export type SystemMember = {
    id: string
    system_id: string
    user_id: string
    status: 'pending' | 'approved' | 'rejected'
    role: 'owner' | 'therapist' | 'staff'
    created_at: string
}
