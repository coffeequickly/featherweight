// 임베딩한 텍스트 전체 보기 — 결과 탭의 몇 줄을 다 펼쳐 읽고 복사하는 화면.
//
// 아웃라인으로 남은 텍스트는 여기 없다 — 파서가 흘리거나 깨뜨리는 쪽이라 없는 셈
// 치고 보여 주는 편이 정직하다. 실측한 경쟁 제품은 아웃라인 텍스트에서 "Amazon" 이
// "Ama on" 으로 추출됐다. 사용자가 이름이나 연락처가 빠졌는지 눈으로 잡을 수 있다.
//
// 여기서는 글자를 고를 수 있어야 한다. base.css 가 전역으로 user-select: none 을 걸어
// 두므로 이 상자 안에서만 되돌린다. 클립보드 API 는 플러그인 iframe 에서 막히는 경우가
// 있어, 숨은 textarea + execCommand 로 복사한다 — 어디서든 도는 쪽이다.

import { Button, Muted, Text } from '@create-figma-plugin/ui'
import { JSX } from 'preact'
import { useState } from 'preact/hooks'

import { t } from '../lib/i18n'

type Props = {
  /** PDF 에 폰트와 함께 들어간 줄. 내보내기 전에는 비어 있다. */
  lines: string[]
}

export function PreviewPanel({ lines }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)

  function copyAll(): void {
    const area = document.createElement('textarea')
    area.value = lines.join('\n')
    // 화면 밖에 두되 focus 는 받아야 한다 — display: none 이면 선택이 안 된다
    area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } finally {
      document.body.removeChild(area)
    }
  }

  if (lines.length === 0) {
    return (
      <div class="previewHead">
        <Text>
          <Muted>{t('preview.empty')}</Muted>
        </Text>
      </div>
    )
  }

  return (
    <div>
      <div class="previewHead">
        <div class="previewCount">
          <Text>
            <Muted>{t('preview.help', { lines: lines.length })}</Muted>
          </Text>
        </div>
        <Button onClick={copyAll} secondary>
          {t(copied ? 'result.copied' : 'result.copy')}
        </Button>
      </div>
      <div class="previewBody">
        {lines.map((line, index) => (
          <div key={index} class="previewLine">
            <Text>{line}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}
