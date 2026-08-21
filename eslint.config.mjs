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
