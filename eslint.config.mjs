import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['build/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main.ts', 'src/main/**/*.ts'],
    languageOptions: {
      globals: { figma: 'readonly', __html__: 'readonly' }
    },
    rules: {
      // 메인 스레드에는 DOM·Canvas·fetch·window 가 없다 (PRD C3)
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'main thread has no DOM (PRD C3)' },
        { name: 'document', message: 'main thread has no DOM (PRD C3)' },
        { name: 'fetch', message: 'main thread has no fetch (PRD C3)' }
      ]
    }
  },
  {
    files: ['src/ui.tsx', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'figma', message: 'UI thread must not touch the figma global (PRD §12)' }
      ]
    }
  },
  {
    // 빌드·배포 스크립트는 Node 에서 돈다 (플러그인 런타임 아님)
    files: ['tools/**/*.mjs', '*.mjs', 'build-figma-plugin.ui.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly'
      }
    },
    rules: {
      // HTML 안에 인라인 스크립트를 만들 때 `<\/script>` 는 필수 이스케이프다
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'figma', message: 'lib must stay Figma-free (PRD §12)' },
        { name: 'window', message: 'lib must stay DOM-free (PRD §12)' },
        { name: 'document', message: 'lib must stay DOM-free (PRD §12)' }
      ]
    }
  }
)
