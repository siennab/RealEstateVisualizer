import { defineConfig } from 'vite'

function resolveBase() {
  if (process.env.GITHUB_ACTIONS !== 'true') return '/'
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return repoName ? `/${repoName}/` : '/'
}

export default defineConfig({
  base: resolveBase(),
  server: { port: 3000, open: true }
})
