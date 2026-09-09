// 시작 탭의 상태 분류. Figma·DOM 의존 금지.
//
// 시작 탭은 문제만 카드로 보여주고 나머지는 회색 한 줄로 누른다. 무엇이 문제인지 세는 일과
// 그것을 그리는 일을 나눠 둔다 — 세는 규칙은 화면 없이 검사할 수 있어야 한다.
//
// 카드는 갈 곳(탭·하위 페이지) 단위로 묶는다. 폰트가 없어서 생긴 아웃라인과 선·효과 때문에
// 생긴 아웃라인은 고치는 곳이 다르므로 한 줄로 합치지 않는다. 반대로 폰트 문제 넷(없음·
// 안 맞음·공간 부족·임베드 제한)은 전부 폰트 탭으로 가므로 한 장으로 묶는다.

import { fontReadiness, uploadedProblems } from './fontStatus'
import { outlinedTexts } from './preflight'
import { FontUsage, Preflight, Reason, Settings, StoredFont } from './types'

export type StartIssue =
  /**
   * 모든 텍스트를 아웃라인으로 — 사용자가 켠 것이라 "문제" 라기보다 상태지만,
   * 폰트 탭의 설정이 통째로 무의미해지므로 시작 탭이 말해야 한다. 다른 사유와 배타적이다.
   */
  | { kind: 'textOff' }
  /** 폰트를 구하지 못했다 */
  | {
      kind: 'fontsMissing'
      fonts: number
      texts: number
      first: string
      rest: number
      auto: number
    }
  /** 넣은 파일이 자리에 맞지 않거나 쓸 수 없다 */
  | { kind: 'fontFiles'; count: number; first: string; mismatch: boolean }
  /** 폰트 문제가 아닌 아웃라인 — 선·효과·그라데이션. 폰트를 넣어도 안 풀린다 */
  | { kind: 'structural'; count: number; reasons: Array<{ reason: Reason; count: number }> }

export function startIssues(
  settings: Settings,
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[],
  preflight: Preflight | null
): StartIssue[] {
  // 전부 아웃라인이면 폰트를 아무리 넣어도 결과가 같다 — 다른 사유를 늘어놓으면 거짓말이다
  if (!settings.embedText) return [{ kind: 'textOff' }]
  if (preflight === null) return []

  const issues: StartIssue[] = []

  const readiness = fontReadiness(fonts, stored)
  if (readiness.missing.length > 0) {
    const [first] = readiness.missing
    issues.push({
      kind: 'fontsMissing',
      fonts: readiness.missing.length,
      texts: readiness.missingTexts,
      first: `${first.family} ${first.style}`,
      rest: readiness.missing.length - 1,
      auto: readiness.total - readiness.missing.length
    })
  }

  const files = uploadedProblems(fonts, stored)
  if (files.length > 0) {
    const [first] = files
    issues.push({
      kind: 'fontFiles',
      count: files.length,
      first: `${first.font.family} ${first.font.style}`,
      mismatch: first.problem.kind === 'mismatch'
    })
  }

  // 폰트가 원인인 것은 위에서 이미 셌다 — 여기 남는 것은 넣어도 안 풀리는 쪽이다
  const structural = outlinedTexts(preflight.textRejects, fonts, stored).filter(
    (reject) => reject.reason.code !== 'reject.missingFont'
  )
  if (structural.length > 0) {
    issues.push({
      kind: 'structural',
      count: structural.length,
      reasons: countReasons(structural.map((reject) => reject.reason))
    })
  }

  return issues
}

/** 같은 사유를 묶고 많은 것부터. 코드가 같아도 파라미터가 다르면 다른 사유다 */
function countReasons(all: readonly Reason[]): Array<{ reason: Reason; count: number }> {
  const groups = new Map<string, { reason: Reason; count: number }>()
  for (const reason of all) {
    const key = `${reason.code}:${JSON.stringify(reason.params ?? {})}`
    const found = groups.get(key)
    if (found === undefined) groups.set(key, { reason, count: 1 })
    else found.count += 1
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}
