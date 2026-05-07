type FetchLike = typeof fetch

export async function authenticateLocalHub(options: {
    jwtToken: string | null
    setJwtToken: (token: string | null) => void
    baseUrl: string
    cliApiToken: string
    fetchImpl: FetchLike
    parseErrorMessage: (status: number, bodyText: string) => string
}): Promise<string> {
    if (options.jwtToken) return options.jwtToken
    const response = await options.fetchImpl(`${options.baseUrl}/api/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: options.cliApiToken }),
    })
    const bodyText = await response.text().catch(() => '')
    if (!response.ok) throw new Error(options.parseErrorMessage(response.status, bodyText))
    const parsed = JSON.parse(bodyText) as { token?: string }
    if (!parsed.token) throw new Error('Local Hub auth response did not include a token.')
    options.setJwtToken(parsed.token)
    return parsed.token
}
