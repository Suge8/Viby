type JoinableClassName = string | false | null | undefined

export function joinClassNames(...values: JoinableClassName[]): string {
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ')
}
