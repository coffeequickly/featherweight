// 넣어 둔 폰트 바이트를 압축해 저장한다 — Figma 가 플러그인에 주는 clientStorage 는 5MB 뿐이다.
//
// TTF 는 deflate 로 절반 가까이 준다(한글 서체 한 가족 9종이 5.1MB 라 한도에 그대로 걸렸다).
// 브라우저 내장 CompressionStream 을 쓰므로 의존성이 없고, 없으면 그냥 원본을 둔다.
// 앞에 4바이트 표식을 붙여 읽는 쪽이 스스로 알아본다 — 옛 버전이 원본으로 저장한 것은 표식이
// 없으니 그대로 쓴다. 인덱스에 형식을 적을 필요가 없다.

const MAGIC = new Uint8Array([0x53, 0x46, 0x5a, 0x31]) // "SFZ1"

function hasMagic(bytes: Uint8Array): boolean {
  return bytes.length >= MAGIC.length && MAGIC.every((value, index) => bytes[index] === value)
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(source).arrayBuffer())
}

/** 저장할 형태로 — 압축이 안 되는 환경이면 원본 그대로 */
export async function packFont(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined' || hasMagic(bytes)) return bytes
  try {
    const deflated = await pipe(bytes, new CompressionStream('deflate-raw'))
    const out = new Uint8Array(MAGIC.length + deflated.length)
    out.set(MAGIC, 0)
    out.set(deflated, MAGIC.length)
    return out
  } catch {
    return bytes
  }
}

/** 저장된 형태에서 원본으로 — 표식이 없으면 옛 버전의 원본이다 */
export async function unpackFont(stored: Uint8Array): Promise<Uint8Array> {
  if (!hasMagic(stored)) return stored
  return pipe(stored.subarray(MAGIC.length), new DecompressionStream('deflate-raw'))
}
