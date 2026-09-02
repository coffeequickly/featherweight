// 넣어 둔 파일이 자리에 맞지 않을 때 사람 말로 — 폰트 화면 행과 체크리스트가 같은 문장을 쓴다

import { t } from '../lib/i18n'
import { storedFileProblem } from '../lib/fontStatus'
import { StoredFont } from '../lib/types'

export function describeFileProblem(font: StoredFont): string | null {
  const problem = storedFileProblem(font)
  if (problem === null) return null
  if (problem.kind === 'unusable') {
    return t(
      problem.reason.code === 'fontFile.variable' ? 'fonts.fileVariable' : 'fonts.fileUnusable'
    )
  }
  return t('fonts.fileMismatch', {
    fileStyle: `${problem.fileWeight}${problem.fileItalic ? ' Italic' : ''}`,
    slotStyle: font.style
  })
}
