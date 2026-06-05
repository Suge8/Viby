export type SafeParseResult<T> = { success: true; data: T } | { success: false }

export type SafeParseSchema<T> = {
    safeParse: (value: unknown) => SafeParseResult<T>
}

export type JsonBodyValidationResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function validateJsonBody<T>(
    body: unknown,
    schema: SafeParseSchema<T>,
    errorMessage = 'Invalid body'
): JsonBodyValidationResult<T> {
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return { ok: false, error: errorMessage }
    }
    return { ok: true, data: parsed.data }
}
