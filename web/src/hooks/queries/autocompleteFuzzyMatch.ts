const DIRECT_MATCH_SCORE = 0
const PREFIX_MATCH_SCORE = 1
const SUBSTRING_MATCH_SCORE = 2
const FUZZY_MATCH_SCORE_OFFSET = 3

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) {
        return b.length
    }

    if (b.length === 0) {
        return a.length
    }

    const matrix: number[][] = []

    for (let row = 0; row <= b.length; row += 1) {
        matrix[row] = [row]
    }

    for (let column = 0; column <= a.length; column += 1) {
        matrix[0][column] = column
    }

    for (let row = 1; row <= b.length; row += 1) {
        for (let column = 1; column <= a.length; column += 1) {
            if (b[row - 1] === a[column - 1]) {
                matrix[row][column] = matrix[row - 1][column - 1]
                continue
            }

            matrix[row][column] = Math.min(
                matrix[row - 1][column - 1] + 1,
                matrix[row][column - 1] + 1,
                matrix[row - 1][column] + 1
            )
        }
    }

    return matrix[b.length][a.length]
}

function getMaxFuzzyDistance(searchTerm: string): number {
    return Math.max(2, Math.floor(searchTerm.length / 2))
}

export function getAutocompleteSearchTerm(queryText: string, prefix: string): string {
    if (queryText.startsWith(prefix)) {
        return queryText.slice(prefix.length).toLowerCase()
    }

    return queryText.toLowerCase()
}

export function getAutocompleteMatchScore(searchTerm: string, candidate: string): number {
    if (candidate === searchTerm) {
        return DIRECT_MATCH_SCORE
    }

    if (candidate.startsWith(searchTerm)) {
        return PREFIX_MATCH_SCORE
    }

    if (candidate.includes(searchTerm)) {
        return SUBSTRING_MATCH_SCORE
    }

    const distance = levenshteinDistance(searchTerm, candidate)
    if (distance > getMaxFuzzyDistance(searchTerm)) {
        return Number.POSITIVE_INFINITY
    }

    return FUZZY_MATCH_SCORE_OFFSET + distance
}
