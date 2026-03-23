export type AccessErrorReason = 'not-found'

export type AccessResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: AccessErrorReason }
