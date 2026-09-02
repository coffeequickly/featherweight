// 편집기에 맞는 낱말 — 디자인 파일은 프레임, Slides 는 슬라이드.
// 문장 키는 {unit}/{units}/{Unit} 자리를 갖고, 여기서 채워 넣는다.

import { t } from '../lib/i18n'
import { EditorKind } from '../lib/types'

export type UnitWords = { unit: string; units: string; Unit: string }

export function unitWords(editor: EditorKind): UnitWords {
  const unit = t(editor === 'slides' ? 'unit.slide' : 'unit.frame')
  const units = t(editor === 'slides' ? 'unit.slides' : 'unit.frames')
  return { unit, units, Unit: unit.charAt(0).toUpperCase() + unit.slice(1) }
}
