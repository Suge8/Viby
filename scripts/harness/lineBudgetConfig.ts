export const scanExtensions = new Set(['.ts', '.tsx', '.js', '.mjs'])
export const sourceSoftLineLimit = 300
export const sourceLineLimit = 360
export const styleLineLimit = 360
export const testLineLimit = 1_200

export const sourceLineBudgetAllowlist = new Set<string>()

export const testLineBudgetAllowlist = new Set(['hub/src/sync/sessionModel.test.ts', 'cli/src/api/apiSession.test.ts'])
