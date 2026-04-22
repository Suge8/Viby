import type { Context } from 'hono'
import { validator } from 'hono/validator'

type SafeParseResult<T> = { success: true; data: T } | { success: false }

type SafeParseSchema<T> = {
    safeParse: (value: unknown) => SafeParseResult<T>
}

async function readJsonBodyOrNull(c: Context): Promise<unknown | null> {
    try {
        return await c.req.json()
    } catch {
        return null
    }
}

export async function parseJsonBody<T>(
    c: Context,
    schema: SafeParseSchema<T>,
    errorMessage: string
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
    const parsed = schema.safeParse(await readJsonBodyOrNull(c))
    if (!parsed.success) {
        return {
            ok: false,
            response: c.json({ error: errorMessage }, 400),
        }
    }

    return {
        ok: true,
        data: parsed.data,
    }
}

export function createJsonBodyValidator<T>(schema: SafeParseSchema<T>, errorMessage: string) {
    return validator('json', async (_value, c) => {
        const parsed = await parseJsonBody(c, schema, errorMessage)
        if (!parsed.ok) {
            return parsed.response
        }
        return parsed.data
    })
}
