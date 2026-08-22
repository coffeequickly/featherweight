// esbuild 설정 덮어쓰기 (create-figma-plugin recipes)
// Phase 2: fonts/*.ttf 를 base64 문자열로 인라인해서 번들에 넣는다 (PRD C8, FR-7).
module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    define: {
      ...buildOptions.define,
      // 푸터 버전 표기용 — 소스는 package.json 하나다
      __PLUGIN_VERSION__: JSON.stringify(require('./package.json').version)
    },
    loader: {
      ...buildOptions.loader,
      '.ttf': 'base64'
    }
  }
}
