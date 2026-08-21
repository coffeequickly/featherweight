// esbuild 설정 덮어쓰기 (create-figma-plugin recipes)
// Phase 2: fonts/*.ttf 를 base64 문자열로 인라인해서 번들에 넣는다 (PRD C8, FR-7).
module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    loader: {
      ...buildOptions.loader,
      '.ttf': 'base64'
    }
  }
}
