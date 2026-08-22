// 빌드 시점에 esbuild define 으로 주입된다 (build-figma-plugin.ui.js).
// 번들 밖(테스트 등)에서는 주입이 없으므로 dev 로 둔다.

declare const __PLUGIN_VERSION__: string

export const PLUGIN_VERSION: string =
  typeof __PLUGIN_VERSION__ === 'undefined' ? 'dev' : __PLUGIN_VERSION__
