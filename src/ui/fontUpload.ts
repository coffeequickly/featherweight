// 폰트 파일 하나를 자리에 넣는다. 목록의 행과 상세 페이지가 같은 것을 쓴다 —
// 두 곳이 다르게 검사하면 한쪽에서 통과한 파일이 다른 쪽에서 거절된다.
//
// 파일에서 family/style 을 읽어 자리를 정하지는 않는다: variable 에서 뽑은 static 인스턴스의
// 이름표가 Figma 가 부르는 이름과 어긋난다("Pretendard Variable SemiBold / Regular").
// 자리는 부르는 쪽이 정하고, 여기서는 그 자리에 맞는 face 를 고르고 검사만 한다.

import { emit } from '@create-figma-plugin/utilities'

import { extractFace } from '../lib/fontCollection'
import { rankFontFiles } from '../lib/fontFolder'
import { formatReason, t } from '../lib/i18n'
import { FontSaveHandler, FontUsage, StoredFont } from '../lib/types'
import { screenFontFile } from '../lib/fontFile'
import { collectionFaces, createProbe, factsOf, FontProbe, namesOf } from './fontkitAdapter'
import { packFont } from './fontPack'
import { Notice, screenUpload } from './fontScreen'

export async function uploadFontFile(
  file: File,
  /** 이 파일이 채울 자리 */
  font: FontUsage,
  /** 지금 저장돼 있는 것 전부 — 한도 계산에 쓴다 */
  all: StoredFont[],
  onNotice: (notice: Notice) => void
): Promise<void> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer())
  let fileName = file.name

  let probe: FontProbe
  try {
    // 컬렉션(TTC)이면 이 자리에 맞는 face 를 골라 단일 폰트로 뽑는다 — macOS 기본 서체가 이 형식이다.
    // 쓸 수 있는 face(가변 아님·윤곽 있음) 중에서 고르고, 이름은 맞는데 쓸 수 없으면 그 이유를 말한다
    const faces = collectionFaces(bytes)
    if (faces !== null) {
      const candidates = faces.map((face, index) => {
        const facts = factsOf(face)
        return {
          ...namesOf(face),
          fileName: file.name,
          weightClass: facts.weightClass,
          italic: facts.italic,
          index,
          verdict: screenFontFile(facts)
        }
      })
      const ranked = rankFontFiles(font, candidates)
      const pick = ranked.find((candidate) => candidate.verdict.ok)
      if (pick === undefined) {
        const unusable = ranked[0]
        if (unusable !== undefined && !unusable.verdict.ok) {
          onNotice({ message: formatReason(unusable.verdict.reason), error: true })
          return
        }
        const listed = candidates
          .slice(0, 8)
          .map((candidate) => `${candidate.family} ${candidate.subfamily}`)
        if (candidates.length > 8) listed.push('…')
        onNotice({
          message: t('font.ttcNoFace', {
            family: font.family,
            style: font.style,
            faces: listed.join(', ')
          }),
          error: true
        })
        return
      }
      bytes = extractFace(bytes, pick.index)
      fileName = `${file.name} (${pick.subfamily})`
    }
    probe = createProbe(bytes)
  } catch {
    onNotice({ message: t('fonts.parseError', { file: file.name }), error: true })
    return
  }

  const verdict = screenUpload(await packFont(bytes), fileName, probe, factsOf(probe), font, all)
  if (!verdict.ok) {
    onNotice(verdict.notice)
    return
  }
  if (verdict.notice !== undefined) onNotice(verdict.notice)
  emit<FontSaveHandler>('font:save', verdict.save)
}
