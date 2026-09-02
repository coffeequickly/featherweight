// 화면에서 쓰는 픽토그램을 한곳에 모은다.
//
// 규칙: viewBox 24 를 12px 로 그린다(= 화면에서 1px 스트로크), 색은 currentColor 를
// 따라간다. 프리셋 칸·값 칩·설정 라벨이 같은 굵기로 보이려면 이 셋이 어긋나면 안 된다.
// 같은 뜻은 어디서나 같은 그림이다 — 칩에서 본 아이콘을 설정 라벨에서 다시 만나야
// 칩만 보고도 무슨 값인지 읽힌다.

import { JSX } from 'preact'

type GlyphProps = { size?: number }

function Glyph({ size = 12, children }: GlyphProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  )
}

/** 품질(JPEG) — 산과 해가 있는 액자 */
export function ImageGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <g>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </g>
    </Glyph>
  )
}

/** 배율 — 양쪽 귀퉁이로 벌어지는 화살표. "보이는 크기의 몇 배까지" */
export function ScaleGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </Glyph>
  )
}

/** 상한 — 양 끝이 막힌 가로선. "긴 변이 여기까지" */
export function EdgeGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M3 12h18M3 7v10M21 7v10" />
    </Glyph>
  )
}

/** 선명하게 — 반짝임. 화질을 가장 많이 남기는 쪽이다. */
export function SparkleGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
    </Glyph>
  )
}

/** 균형 — 반만 채운 원. 화질과 용량 사이 */
export function BalanceGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <g>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 010 18z" fill="currentColor" stroke="none" />
      </g>
    </Glyph>
  )
}

/**
 * 최소 용량 — 가운데로 모이는 꺾쇠 둘.
 * 12px 에서는 획이 적을수록 읽힌다 — 귀퉁이 화살표도, 기둥 달린 화살표도 뭉쳤다.
 * 꺾쇠는 깊고 가까우면 X 자로 붙어 "닫기" 로 보인다. 넓고 완만하게, 사이를 벌린다.
 */
export function CompressGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <g>
        <path d="M5 6l7 3 7-3" />
        <path d="M5 18l7-3 7 3" />
      </g>
    </Glyph>
  )
}

/** 되돌리기 — 반시계 화살표. 직접 만진 숫자를 프리셋으로 */
export function ResetGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <g>
        <path d="M3 4v6h6" />
        <path d="M5.5 15a8 8 0 1 0 1.9-8.3L3 10" />
      </g>
    </Glyph>
  )
}

/** 목표 용량 — 과녁. 숫자를 정해 두고 거기 맞춘다 */
export function TargetGlyph({ size }: GlyphProps = {}): JSX.Element {
  return (
    <Glyph size={size}>
      <g>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </g>
    </Glyph>
  )
}
