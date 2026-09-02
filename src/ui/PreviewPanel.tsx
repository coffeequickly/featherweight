// 제출 전에 "채용 시스템이 뭘 읽어 갈지" 를 보여주는 탭.
//
// 아웃라인으로 남은 텍스트는 여기 없다 — 파서가 흘리거나 깨뜨리는 쪽이라 없는 셈
// 치고 보여 주는 편이 정직하다. 실측한 경쟁 제품은 아웃라인 텍스트에서 "Amazon" 이
// "Ama on" 으로 추출됐다. 사용자가 이름이나 연락처가 빠졌는지 눈으로 잡을 수 있다.

import { Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { t } from '../lib/i18n'

type Props = {
  /** 진짜 폰트로 임베드된 줄. 내보내기 전에는 비어 있다. */
  lines: string[]
}

export function PreviewPanel({ lines }: Props): JSX.Element {
  if (lines.length === 0) {
    return (
      <div>
        <VerticalSpace space="small" />
        <Text>
          <Muted>{t('preview.empty')}</Muted>
        </Text>
      </div>
    )
  }

  return (
    <div>
      <VerticalSpace space="small" />
      <Text>
        <Muted>{t('preview.help', { lines: lines.length })}</Muted>
      </Text>
      <VerticalSpace space="small" />
      <div class="previewBody">
        {lines.map((line, index) => (
          <div key={index} class="previewLine">
            <Text>
              <Muted>{line}</Muted>
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}
