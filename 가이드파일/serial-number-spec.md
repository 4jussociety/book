# 10자리 일련번호 생성 알고리즘 명세서
# 시스템 식별을 위한 고유 일련번호 생성 규칙을 정의합니다.

## 개요

시스템(치과/병원 등) 개설 시 발급되는 **10자리 숫자** 형태의 고유 식별번호입니다.
게스트 사용자가 이 번호를 입력하여 해당 시스템에 입장 요청을 보냅니다.

## 형식

| 항목 | 값 |
|------|-----|
| 길이 | 10자리 |
| 문자 | 숫자만 (0-9) |
| 범위 | `1000000000` ~ `9999999999` |
| 예시 | `2602150847` |

## 생성 알고리즘

**타임스탬프 + 랜덤 조합 방식**을 사용합니다.

```
일련번호 = [년도2자리][월2자리][일2자리] + [랜덤4자리]
```

### 구성 요소

| 위치 | 자릿수 | 설명 | 예시 |
|------|--------|------|------|
| 1-2 | 2자리 | 연도 (하위 2자리) | `26` (2026년) |
| 3-4 | 2자리 | 월 | `02` (2월) |
| 5-6 | 2자리 | 일 | `15` (15일) |
| 7-10 | 4자리 | 랜덤 숫자 | `0847` |

### 구현 코드

```typescript
function generateSerialNumber(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)    // "26"
  const mm = String(now.getMonth() + 1).padStart(2, '0') // "02"
  const dd = String(now.getDate()).padStart(2, '0')     // "15"
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0') // "0847"
  return `${yy}${mm}${dd}${rand}`
}
```

## 중복 방지 전략

### 1차 방어: 확률적 분산
- 같은 날 생성 시 랜덤 4자리 = 10,000개 조합
- 하루 최대 10,000개 시스템 생성 가능 (충분한 여유)

### 2차 방어: DB UNIQUE 제약
- `systems.serial_number` 컬럼에 `UNIQUE` 제약 조건 설정 (이미 적용됨)
- 중복 발생 시 DB에서 에러 반환

### 3차 방어: 클라이언트 재시도
- 중복 에러 감지 시 새 번호로 **최대 5회 재시도**
- 5회 모두 실패 시 사용자에게 오류 메시지 표시

```typescript
async function createSystemWithRetry(userId: string, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const serial = generateSerialNumber()
    const { data, error } = await supabase
      .from('systems')
      .insert({ serial_number: serial, owner_id: userId })
      .select()
      .single()

    if (!error) return data
    if (!error.message.includes('unique') && !error.message.includes('duplicate')) {
      throw error // 중복 외 에러는 즉시 throw
    }
  }
  throw new Error('일련번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
}
```

## 보안 고려사항

| 항목 | 설명 |
|------|------|
| 예측 가능성 | 날짜 부분은 예측 가능하나, 4자리 랜덤이 무차별 대입 방지 |
| 브루트포스 | 10,000가지 조합 × 365일 = 연간 365만 조합으로 충분 |
| 추가 보호 | 입장 요청은 관리자 승인 필수 → 번호 유출만으로 접근 불가 |


