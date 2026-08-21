// 저장 파일명 정리. Figma·DOM 의존 금지.

const MAX_LENGTH = 120

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const RESERVED_CHARS = /[/\\:*?"<>|]/g

/** 파일명에 못 쓰는 문자를 걷어낸다. 비면 기본값으로. */
export function sanitizeFileName(name: string, fallback = 'Featherweight'): string {
  const cleaned = name
    .replace(CONTROL_CHARS, '')
    .replace(RESERVED_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_LENGTH)
    .trim()

  return cleaned === '' ? fallback : cleaned
}

export function pdfFileName(documentName: string): string {
  return `${sanitizeFileName(documentName)}.pdf`
}

/**
 * 파일명 기본값 제안. 문서 이름만 쓰면 같은 문서의 모든 내보내기가 같은 이름이 된다 —
 * 한 프레임만 내보낼 때는 그 프레임 이름을, 뒤에는 날짜를 붙여 반복 내보내기도
 * 서로 덮어쓰지 않게 한다. 마음에 안 들면 파일명 필드에서 지우면 된다.
 */
export function suggestFileName(
  frameNames: readonly string[],
  documentName: string,
  now: Date
): string {
  const base = frameNames.length === 1 ? frameNames[0] : documentName
  return `${sanitizeFileName(base)}_${timeStamp(now)}`
}

/** 20260821133911 — 숫자만, 초까지. 연속으로 내보내도 겹치지 않고 이름순이 시간순이다. */
export function timeStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}
