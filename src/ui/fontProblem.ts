// 넣어 둔 파일이 텍스트와 맞지 않을 때 사람 말로 — 폰트 화면 행과 체크리스트가 같은 문장을 쓴다.
//
// "파일은 600, 자리는 Regular" 는 만든 사람 말이다. 쓰는 사람은 "Regular 텍스트가 SemiBold
// 굵기로 나간다" 를 알아야 하고, 그 다음에 뭘 하면 되는지를 알아야 한다.

import { weightName } from '../lib/fontInventory'
import { StoredFileProblem, storedFileProblem } from '../lib/fontStatus'
import { t } from '../lib/i18n'
import { StoredFont } from '../lib/types'

export function describeFileProblem(font: StoredFont): string | null {
  const problem = storedFileProblem(font)
  return problem === null ? null : problemText(problem, font.style)
}

export function problemText(problem: StoredFileProblem, slotStyle: string): string {
  if (problem.kind === 'variable') {
    return problem.defaultWeight === undefined
      ? t('fonts.fileVariable', { slotStyle })
      : t('fonts.fileVariableAs', { slotStyle, fileStyle: weightName(problem.defaultWeight) })
  }
  if (problem.kind === 'unusable') return t('fonts.fileUnusable', { slotStyle })
  return t('fonts.fileMismatch', {
    slotStyle,
    fileStyle: weightName(problem.fileWeight, problem.fileItalic)
  })
}
