export type Profile = {
    id: string
    email?: string
    name?: string
    full_name: string
    role: string // 'staff' | 'admin' | 'therapist'
    color_code?: string
    system_id: string | null
    created_at?: string
    message_template?: string
    avatar_url?: string
    organization_name?: string
    contact_number?: string
    is_owner?: boolean // 클라이언트 상태용 (DB 컬럼 아님)
    incentive_percentage?: number // 0~100
}

export type Patient = {
    id: string
    patient_no: number
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

export type GuestAccess = {
    id: string
    system_id: string
    user_id: string
    status: 'pending' | 'approved' | 'rejected'
    role?: 'therapist' | 'staff' // Added role column
    created_at: string
}
