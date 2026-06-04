export type AcpStderrErrorType = 'rate_limit' | 'model_not_found' | 'authentication' | 'quota_exceeded' | 'unknown'

export type AcpStderrError = {
    type: AcpStderrErrorType
    message: string
    raw: string
}

export function classifyAcpStderrError(text: string): AcpStderrError | null {
    const lowerText = text.toLowerCase()

    if (
        lowerText.includes('status 429') ||
        lowerText.includes('ratelimitexceeded') ||
        lowerText.includes('rate limit')
    ) {
        return {
            type: 'rate_limit',
            message: 'Rate limit exceeded. Please wait before sending more requests.',
            raw: text,
        }
    }

    if (lowerText.includes('status 404') || lowerText.includes('model not found') || lowerText.includes('not_found')) {
        return {
            type: 'model_not_found',
            message: 'Model not found. Available models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite',
            raw: text,
        }
    }

    if (
        lowerText.includes('status 401') ||
        lowerText.includes('status 403') ||
        lowerText.includes('unauthenticated') ||
        lowerText.includes('permission denied') ||
        lowerText.includes('authentication')
    ) {
        return {
            type: 'authentication',
            message: 'Authentication failed. Please check your credentials or run "gemini auth login".',
            raw: text,
        }
    }

    if (
        lowerText.includes('quota') ||
        lowerText.includes('resource exhausted') ||
        lowerText.includes('resourceexhausted')
    ) {
        return {
            type: 'quota_exceeded',
            message: 'API quota exceeded. Please check your billing or wait for quota reset.',
            raw: text,
        }
    }

    return lowerText.includes('error') || lowerText.includes('failed') || lowerText.includes('exception')
        ? {
              type: 'unknown',
              message: text,
              raw: text,
          }
        : null
}
