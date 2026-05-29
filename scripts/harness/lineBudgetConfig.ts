export const scanExtensions = new Set(['.ts', '.tsx', '.js', '.mjs'])
export const sourceSoftLineLimit = 300
export const sourceLineLimit = 360
export const styleLineLimit = 360
export const testLineLimit = 1_200

export const sourceLineBudgetAllowlist = new Set<string>([
    // Concurrent in-flight agent config polish work (`desktop/src/components/CodingAgentsPage.tsx`)
    // pushed this file to 371 lines; the owner of that change is the right
    // party to split. Baseline entry keeps unrelated CI green meanwhile.
    'desktop/src/components/CodingAgentsPage.tsx',
])

export const testLineBudgetAllowlist = new Set(['hub/src/sync/sessionModel.test.ts', 'cli/src/api/apiSession.test.ts'])
