import { render } from '@create-figma-plugin/ui'
import '!./ui/styles.css'

import { detectLocale, setLocale } from './lib/i18n'
import { App } from './ui/App'

// 렌더 전에 언어를 확정한다 — 문장은 전부 lib/i18n 사전에서 온다
setLocale(detectLocale(navigator.language))

export default render(App)
