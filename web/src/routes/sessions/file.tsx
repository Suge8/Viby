import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import { FileIcon } from '@/components/FileIcon'
import {
    FeatureCheckIcon as CheckIcon,
    FeatureCopyIcon as CopyIcon,
} from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { SessionRouteHeader } from '@/routes/sessions/components/SessionRouteHeader'
import { SessionRouteTabs } from '@/routes/sessions/components/SessionRouteTabs'
import { FileContentSkeleton, PlainFileContent } from '@/routes/sessions/filesPageViews'
import {
    decodeFilePath,
    extractCommandError,
    getPreferredFileDisplayMode,
    getUtf8ByteLength,
    isBinaryContent,
    MAX_COPYABLE_FILE_BYTES,
    resolveActiveFileDisplayMode,
    resolveFileLanguage,
    shouldLoadFileContent,
    type FileDisplayMode,
} from '@/routes/sessions/filePageUtils'
import { useTranslation } from '@/lib/use-translation'
import { decodeBase64 } from '@/lib/utils'

const LazyFileContentView = lazy(async () => import('@/routes/sessions/fileContentView'))

const DISPLAY_MODES: readonly FileDisplayMode[] = ['diff', 'file'] as const

export default function FilePage(): ReactNode {
    const { t } = useTranslation()
    useFinalizeBootShell()
    const { api } = useAppContext()
    const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })

    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged
    const filePath = useMemo(() => decodeFilePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'
    const preferredDisplayMode = getPreferredFileDisplayMode(search.tab)
    const [displayMode, setDisplayMode] = useState<FileDisplayMode>(preferredDisplayMode)

    const diffQuery = useQuery({
        queryKey: queryKeys.gitFileDiff(sessionId, filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }

            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
        enabled: Boolean(api && sessionId && filePath),
    })

    const diffContent = diffQuery.data?.success ? diffQuery.data.stdout ?? '' : ''
    const hasDiffContent = diffContent.length > 0
    let diffResolution: 'error' | 'ready' | 'pending' = 'pending'
    if (diffQuery.isError) {
        diffResolution = 'error'
    } else if (diffQuery.isSuccess) {
        diffResolution = 'ready'
    }
    const shouldRequestFileContent = shouldLoadFileContent({
        displayMode,
        diffResolution,
        diffCommandFailed: diffQuery.data?.success === false,
        hasDiffContent,
    })

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }

            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath) && shouldRequestFileContent,
    })

    const diffError = extractCommandError(diffQuery.data)
    const fileContentResult = fileQuery.data
    const decodedContentResult = fileContentResult?.success && fileContentResult.content
        ? decodeBase64(fileContentResult.content)
        : { ok: true, text: '' }
    const decodedContent = decodedContentResult.text
    const binaryFile = fileContentResult?.success
        ? !decodedContentResult.ok || isBinaryContent(decodedContent)
        : false
    const language = useMemo(() => resolveFileLanguage(filePath), [filePath])
    const contentSizeBytes = useMemo(() => getUtf8ByteLength(decodedContent), [decodedContent])
    const canCopyContent = fileContentResult?.success === true
        && !binaryFile
        && decodedContent.length > 0
        && contentSizeBytes <= MAX_COPYABLE_FILE_BYTES
    const loading = diffQuery.isLoading || (shouldRequestFileContent && fileQuery.isLoading)
    const fileError = fileContentResult?.success === false
        ? formatOptionalUserFacingErrorMessage(fileContentResult.error, {
            t,
            fallbackKey: 'file.error.read'
        })
        : null
    const diffUnavailableMessage = formatOptionalUserFacingErrorMessage(diffError, {
        t,
        fallbackKey: 'file.error.diffUnavailable'
    })

    useEffect(() => {
        setDisplayMode(preferredDisplayMode)
    }, [filePath, preferredDisplayMode])

    const activeMode = resolveActiveFileDisplayMode({
        hasDiffContent,
        preferredDisplayMode: displayMode,
    })
    const showModeTabs = hasDiffContent
    const visibleContent = activeMode === 'diff' && hasDiffContent ? diffContent : decodedContent

    return (
        <div className="flex h-full flex-col">
            <SessionRouteHeader
                title={fileName}
                subtitle={filePath || t('file.error.unknownPath')}
                onBack={goBack}
            />

            <div className="bg-[var(--app-bg)]">
                <div className="mx-auto flex w-full ds-stage-shell items-center gap-2 border-b border-[var(--app-divider)] px-3 py-2">
                    <FileIcon fileName={fileName} size={20} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--app-hint)]">{filePath}</span>
                    <Button
                        type="button"
                        variant="plain"
                        size="iconSm"
                        onClick={() => copyPath(filePath)}
                        className="h-8 w-8 shrink-0 rounded-md p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                        title={t('file.copyPath')}
                    >
                        {pathCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    </Button>
                </div>
            </div>

            {showModeTabs ? (
                <SessionRouteTabs
                    activeId={activeMode}
                    items={DISPLAY_MODES.map((mode) => ({
                        id: mode,
                        label: t(mode === 'diff' ? 'file.mode.diff' : 'file.mode.file'),
                    }))}
                    onChange={(nextMode) => setDisplayMode(nextMode === 'diff' ? 'diff' : 'file')}
                />
            ) : null}

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full ds-stage-shell p-4">
                    {diffUnavailableMessage ? (
                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs text-[var(--app-hint)]">
                            {diffUnavailableMessage}
                        </div>
                    ) : null}

                    {!filePath ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('file.error.noPath')}</div>
                    ) : loading ? (
                        <FileContentSkeleton label={t('loading.file')} />
                    ) : fileError ? (
                        <div className="text-sm text-[var(--app-hint)]">{fileError}</div>
                    ) : binaryFile ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('file.error.binary')}</div>
                    ) : activeMode === 'diff' && hasDiffContent ? (
                        <Suspense fallback={<PlainFileContent content={visibleContent} />}>
                            <LazyFileContentView
                                content={visibleContent}
                                language="diff"
                                mode="diff"
                                showCopyButton={false}
                            />
                        </Suspense>
                    ) : decodedContent ? (
                        <Suspense fallback={<PlainFileContent content={visibleContent} />}>
                            <LazyFileContentView
                                content={visibleContent}
                                language={language}
                                mode="file"
                                showCopyButton={canCopyContent}
                            />
                        </Suspense>
                    ) : activeMode === 'diff' ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('file.error.noChanges')}</div>
                    ) : (
                        <div className="text-sm text-[var(--app-hint)]">{t('file.error.empty')}</div>
                    )}
                </div>
            </div>
        </div>
    )
}
