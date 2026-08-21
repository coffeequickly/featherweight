#!/usr/bin/env python3
"""두 PDF 를 픽셀 단위로 비교한다. "육안 비교 OK" 를 숫자로 바꾸는 도구.

  npm run compare -- before.pdf after.pdf
  npm run compare -- before.pdf after.pdf --dpi 200 --out /tmp/sheaf-diff

before 는 기준(Figma 기본 export 또는 텍스트 임베드 끈 결과),
after 는 확인할 결과다. (PRD §11 수동 비교, G2)

각 페이지마다
  - 다른 픽셀 비율
  - **정렬 검사**: ±3px 로 밀어 봐서 차이가 크게 줄면 위치가 밀린 것이다
  - diff 이미지 (빨강 = 기준에만 있음, 파랑 = 결과에만 있음)

"다른 픽셀 %" 만으로는 판단할 수 없다. 같은 글자를 다른 폰트 기술로 그리면 가장자리가
달라지는데, 작은 글자가 빽빽한 페이지에서는 그것만으로 8% 가 나온다.
그래서 "밀렸는가" 를 따로 잰다 — 이게 실제로 알고 싶은 것이다.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

# 안티에일리어싱 차이는 무시한다. 이보다 크게 다른 픽셀만 센다.
TOLERANCE = 40


def render(pdf: Path, out_dir: Path, dpi: int, prefix: str) -> list[Path]:
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(out_dir / prefix)],
        check=True,
        capture_output=True,
    )
    return sorted(out_dir.glob(f"{prefix}-*.png"))


def compare_page(before: Path, after: Path, diff_path: Path) -> dict[str, object]:
    a = Image.open(before).convert("L")
    b = Image.open(after).convert("L")

    if a.size != b.size:
        return {"error": f"페이지 크기가 다르다: {a.size} vs {b.size}"}

    diff = ImageChops.difference(a, b)
    mask = diff.point(lambda value: 255 if value > TOLERANCE else 0)
    changed = sum(mask.point(lambda v: 1 if v else 0).getdata())
    total = a.size[0] * a.size[1]

    # 빨강 = 기준에만 있던 잉크, 파랑 = 결과에만 있는 잉크
    only_before = ImageChops.subtract(a, b).point(lambda v: 255 if v > TOLERANCE else 0)
    only_after = ImageChops.subtract(b, a).point(lambda v: 255 if v > TOLERANCE else 0)
    Image.merge(
        "RGB",
        (
            ImageChops.invert(only_after),
            ImageChops.invert(ImageChops.lighter(only_before, only_after)),
            ImageChops.invert(only_before),
        ),
    ).save(diff_path)

    # 위치가 통째로 밀렸다면 살짝 이동시켰을 때 차이가 크게 준다.
    # 가장자리 차이뿐이면 어떻게 밀어도 거의 안 준다.
    best = (changed, 0, 0)
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            if dx == 0 and dy == 0:
                continue
            moved = ImageChops.difference(a, ImageChops.offset(b, dx, dy))
            score = sum(moved.point(lambda value: 1 if value > TOLERANCE else 0).getdata())
            if score < best[0]:
                best = (score, dx, dy)

    return {
        "changed": changed,
        "ratio": changed / total,
        "bbox": mask.getbbox(),
        "size": a.size,
        "diff": diff_path,
        "shift": (best[1], best[2]),
        "shifted": best[0],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    for pdf in (args.before, args.after):
        if not pdf.exists():
            raise SystemExit(f"파일이 없다: {pdf}")

    if shutil.which("pdftoppm") is None:
        raise SystemExit("pdftoppm 이 없다. `brew install poppler`")

    out_dir = args.out if args.out is not None else Path(tempfile.mkdtemp(prefix="sheaf-diff-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    before_pages = render(args.before, out_dir, args.dpi, "before")
    after_pages = render(args.after, out_dir, args.dpi, "after")

    print(f"기준  {args.before}  {args.before.stat().st_size:,} bytes · {len(before_pages)}쪽")
    print(f"결과  {args.after}  {args.after.stat().st_size:,} bytes · {len(after_pages)}쪽")
    print(f"해상도 {args.dpi}dpi · 허용 오차 {TOLERANCE}/255\n")

    if len(before_pages) != len(after_pages):
        print(f"⚠ 페이지 수가 다르다: {len(before_pages)} vs {len(after_pages)}")

    worst = 0.0
    for index, (before, after) in enumerate(zip(before_pages, after_pages), start=1):
        result = compare_page(before, after, out_dir / f"diff-{index}.png")
        if "error" in result:
            print(f"{index}쪽  {result['error']}")
            continue

        ratio = float(result["ratio"])
        worst = max(worst, ratio)
        shift = result["shift"]
        gain = 1 - (int(result["shifted"]) / max(1, int(result["changed"])))

        # 밀어서 차이가 30% 넘게 줄면 위치 문제다
        misaligned = shift != (0, 0) and gain > 0.3
        mark = "밀림" if misaligned else ("OK " if ratio < 0.02 else "가장자리")

        print(f"{index}쪽  {mark}  다른 픽셀 {ratio:6.3%}  ({result['changed']:,}개)")
        if misaligned:
            print(f"       {shift[0]:+d},{shift[1]:+d} px 밀면 차이가 {gain:.0%} 준다 → 좌표를 확인해라")

    print(f"\n최대 차이 {worst:.3%}")
    print(f"diff 이미지: {out_dir}/diff-*.png  (빨강=기준에만, 파랑=결과에만)")
    print("\n'밀림' 이 없으면 글자는 제자리다. 남은 차이는 글리프 가장자리 렌더 차이이고,")
    print("작은 글자가 빽빽한 페이지일수록 커진다. 확실히 보려면 diff 이미지를 확대해라.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
