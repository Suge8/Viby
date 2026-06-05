import { type SafeParseSchema, validateJsonBody } from '@viby/protocol'
import type { Context } from 'hono'
import { validator } from 'hono/validator'

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
    const result = validateJsonBody(await readJsonBodyOrNull(c), schema, errorMessage)
    if (!result.ok) {
        return {
            ok: false,
            response: c.json({ error: result.error }, 400),
        }
    }

    return {
        ok: true,
        data: result.data,
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
