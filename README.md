# Featherweight

Figma 프레임을 **가벼운 PDF** 로 내보내는 플러그인입니다.

Figma 기본 export 는 이미지를 원본 해상도 그대로 넣고, 텍스트를 글리프 아웃라인(벡터
패스)으로 뽑습니다. 그래서 이력서·포트폴리오가 10~20MB 가 되고, 본문이 선택·복사·검색이
안 되며, 채용 플랫폼 파서(ATS)가 내용을 읽지 못합니다. Featherweight 는 둘 다 고칩니다.

- **이미지** — export 전에 화면 표시 크기에 맞춰 다운스케일합니다. 원본 레이어는 건드리지 않습니다.
- **텍스트** — 아웃라인 대신 **진짜 폰트를 서브셋 임베드**합니다. 선택·검색·복사가 되고 파일이 줄어듭니다.

같은 이력서 기준 9.6MB → 1MB 미만. (이미지 구성에 따라 다릅니다)

## 설치

**Figma Community**: [FeatherWeight – Light PDF Export (Real Fonts)](https://www.figma.com/community/plugin/1672509720278498323)
— 현재 심사 중이며, 승인되면 위 링크에서 바로 설치할 수 있습니다.

심사 전이거나 개발 빌드를 쓰려면:

1. [Releases](../../releases) 에서 zip 을 받아 옮기지 않을 자리에 풉니다. 예: `~/figma-plugins/featherweight`
2. Figma 데스크톱 → Plugins → Development → **Import plugin from manifest…** → 푼 폴더의 `manifest.json`

소스에서 빌드하려면 `npm ci && npm run build` 후 레포 루트의 `manifest.json` 을 import 합니다.

UI 는 Figma 앱 언어를 따라 한국어/영어로 표시됩니다.

## 사용법

1. 캔버스에서 내보낼 프레임들을 선택하고 플러그인을 실행합니다
2. 드래그(또는 ↑↓)로 순서를 조정하고, ✕ 로 제외합니다 — 원본 레이어에는 아무 영향이 없습니다.
   행을 클릭하면 캔버스에서 그 프레임을 보여줍니다
3. 이미지 탭에서 프리셋(선명하게/균형/최소 용량)을, 폰트 탭에서 임베드 상태를 확인합니다
4. **[PDF 내보내기]** → 저장 다이얼로그에 "이름_타임스탬프.pdf" 가 채워집니다.
   결과 리포트의 사유를 클릭하면 해당 레이어를 캔버스에서 찾아줍니다

## 폰트

문서가 쓰는 폰트를 "폰트" 패널에 보여줍니다. 세 가지 상태가 있습니다.

| 상태 | 동작 |
|---|---|
| 카탈로그에 있음 | 내보낼 때 CDN(jsDelivr)에서 자동으로 받아 임베드. 할 일 없음 |
| 직접 넣음 | [넣기] 로 TTF/OTF 파일을 한 번 넣으면 저장되고, 그 뒤로 자동 임베드 |
| 파일 없음 | **아웃라인으로 유지** — 모양은 원본과 동일, 용량·검색만 포기 |

**절대 다른 폰트로 대체하지 않습니다.** 구할 수 없으면 원본 그대로 아웃라인입니다.

자동으로 받아오는 오픈 폰트 (전부 SIL OFL 1.1):

> Pretendard · Pretendard JP · 나눔고딕 · 나눔명조 · 나눔고딕코딩 · 나눔손글씨 펜/붓 ·
> Gothic A1 · 고운돋움 · 고운바탕 · IBM Plex Sans KR · Spoqa Han Sans Neo · 도현 · 주아 ·
> Black Han Sans

카탈로그의 모든 주소는 `npm run verify:catalog` 가 실제로 내려받아 검증합니다
(TTF 인지, static 인지, 한글이 있는지, 굵기가 맞는지).

## 아웃라인으로 남는 경우

아래 텍스트는 실 폰트로 바꾸지 않고 원본 아웃라인을 유지합니다. 모양은 Figma 와 똑같고,
결과 리포트에 노드 수와 사유가 표시됩니다.

- 회전·반전된 텍스트, 패스 위 텍스트
- 그라데이션·이미지 fill, 스트로크, 이펙트(그림자·블러)가 있는 텍스트
- 밑줄·취소선 텍스트 (다시 그리는 코드가 아직 없습니다 — 지우고 안 그리느니 아웃라인)
- 폰트 파일을 구하지 못한 텍스트, 폰트에 없는 글자가 있는 텍스트

## 면책조건

- **결과는 제출 전에 반드시 눈으로 확인해 주세요.** 이 플러그인은 텍스트를 폰트로 다시
  그립니다. 원본과 미세하게 다를 수 있고, 결과물 사용의 책임은 사용자에게 있습니다.
- **직접 넣은 폰트의 라이선스는 사용자 책임입니다.** 상용 폰트 상당수는 문서 임베드를
  제한합니다. 구매한 폰트의 라이선스가 PDF 임베드를 허용하는지 확인하고 넣어 주세요.
  카탈로그로 자동으로 받아오는 폰트는 전부 OFL 이라 임베드가 허용됩니다.
- **네트워크는 폰트 다운로드에만 사용합니다** (`cdn.jsdelivr.net`). 문서 내용·이미지·텍스트는
  어디에도 전송되지 않고, 텔레메트리도 없습니다.
- 텍스트가 추출 가능한 형태로 들어가지만, 특정 ATS 의 파싱 결과를 보장하지는 않습니다.

## 개발

```
npm ci
npm run dev             # watch 빌드
npm test                # 단위 테스트
npm run lint            # eslint + prettier
npm run verify:catalog  # 폰트 카탈로그·파이프라인 실검증 (네트워크 사용)
npm run package         # dist/*.zip 패키징
npm run install:local   # ~/figma-plugins/ 에 설치 (QA 용)
```

구조와 설계 근거는 `docs/PRD.md`, 런타임 가정 검증은 `docs/SPIKES.md`,
수동 QA 는 `docs/CHECKLIST.md`, 출시 절차는 `docs/RELEASE.md` 를 참고하세요.

## 고지

- 이 플러그인은 Figma, Inc. 와 무관한 비공식 도구입니다.
- 의존성: [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) ·
  [fontkit](https://github.com/foliojs/fontkit) (MIT) ·
  [create-figma-plugin](https://github.com/yuanqing/create-figma-plugin) (MIT)
- 코드 라이선스: [MIT](LICENSE)
