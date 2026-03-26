type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type UserFacingErrorRule = {
    match: string | RegExp
    key: string
}

type UserFacingErrorOptions = {
    t: TranslationFn
    fallbackKey: string
    codeMap?: Readonly<Record<string, string>>
    messageMap?: readonly UserFacingErrorRule[]
    allowPassthrough?: boolean
}

const TECHNICAL_ERROR_PATTERNS = [
    /\bgrpc\b/i,
    /\brpc\b/i,
    /\bjsonrpc\b/i,
    /\btransport\b/i,
    /\bstdout\b/i,
    /\bstderr\b/i,
    /\bhttp\s+\d{3}\b/i,
    /\bstatus code\b/i,
    /\bfetch failed\b/i,
    /\bnetwork error\b/i,
    /\bECONN[A-Z_]*\b/,
    /\bENOENT\b/,
    /\bEPIPE\b/,
    /\bETIMEDOUT\b/,
    /\bEADDRINUSE\b/,
    /\bTypeError\b/,
    /\bSyntaxError\b/,
    /\bat\s+\S+/,
]

const GENERATED_MESSAGE_PATTERNS = [
    /^failed to\b/i,
    /^invalid\b/i,
    /^missing\b/i,
    /^unexpected\b/i,
    /^unknown\b/i,
    /^session unavailable$/i,
    /^api unavailable$/i,
    /^machine unavailable$/i,
    /^directory not found$/i,
]

function extractErrorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') {
        return null
    }

    return typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null
}

function extractErrorMessage(error: unknown): string | null {
    if (typeof error === 'string') {
        return error.trim() || null
    }

    if (error instanceof Error) {
        return error.message.trim() || null
    }

    if (!error || typeof error !== 'object') {
        return null
    }

    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
        return message.trim()
    }

    const nestedError = (error as { error?: unknown }).error
    return typeof nestedError === 'string' && nestedError.trim()
        ? nestedError.trim()
        : null
}

function resolveMessageRule(
    message: string,
    rules: readonly UserFacingErrorRule[] | undefined
): string | null {
    if (!rules) {
        return null
    }

    for (const rule of rules) {
        if (typeof rule.match === 'string' ? rule.match === message : rule.match.test(message)) {
            return rule.key
        }
    }

    return null
}

function shouldHideRawMessage(message: string): boolean {
    if (!message || message.length > 180) {
        return true
    }

    return GENERATED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
        || TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function formatUserFacingErrorMessage(
    error: unknown,
    options: UserFacingErrorOptions
): string {
    const code = extractErrorCode(error)
    if (code && options.codeMap?.[code]) {
        return options.t(options.codeMap[code])
    }

    const message = extractErrorMessage(error)
    if (!message) {
        return options.t(options.fallbackKey)
    }

    const matchedKey = resolveMessageRule(message, options.messageMap)
    if (matchedKey) {
        return options.t(matchedKey)
    }

    if (shouldHideRawMessage(message) || options.allowPassthrough !== true) {
        return options.t(options.fallbackKey)
    }

    return message
}

export function formatOptionalUserFacingErrorMessage(
    error: unknown,
    options: UserFacingErrorOptions
): string | null {
    if (!error) {
        return null
    }

    return formatUserFacingErrorMessage(error, options)
}
