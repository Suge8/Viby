import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import { CodeBlock } from '@/components/CodeBlock'
import { FileIcon } from '@/components/FileIcon'
import { CheckIcon, CopyIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { queryKeys } from '@/lib/query-keys'
import { SessionRouteHeader } from '@/routes/sessions/components/SessionRouteHeader'
import { SessionRouteTabs } from '@/routes/sessions/components/SessionRouteTabs'
import { DiffDisplay, FileContentSkeleton } from '@/routes/sessions/filePageViews'
import { decodeFilePath, extractCommandError, getUtf8ByteLength, isBinaryContent, MAX_COPYABLE_FILE_BYTES, resolveFileLanguage } from '@/routes/sessions/filePageUtils'
import { useTranslation } from '@/lib/use-translation'
import { decodeBase64 } from '@/lib/utils'

type DisplayMode = 'diff' | 'file'

const DISPLAY_MODES: DisplayMode[] = ['diff', 'file']

export default function FilePage(): ReactNode {
    const { t } = useTranslation()
    const { api } = useAppContext()
    const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/file' })
    const search = useSearch({ from: '/sessions/$sessionId/file' })
    const [displayMode, setDisplayMode] = useState<DisplayMode>('diff')

    const encodedPath = typeof search.path === 'string' ? search.path : ''
    const staged = search.staged
    const filePath = useMemo(() => decodeFilePath(encodedPath), [encodedPath])
    const fileName = filePath.split('/').pop() || filePath || 'File'

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

    const fileQuery = useQuery({
        queryKey: queryKeys.sessionFile(sessionId, filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }

            return await api.readSessionFile(sessionId, filePath)
        },
        enabled: Boolean(api && sessionId && filePath),
    })

    const diffContent = diffQuery.data?.success ? diffQuery.data.stdout ?? '' : ''
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
    const loading = diffQuery.isLoading || fileQuery.isLoading
    const fileError = fileContentResult && !fileContentResult.success
        ? fileContentResult.error ?? t('file.error.read')
        : null
    const hasDiffContent = diffContent.length > 0
    const diffUnavailableMessage = diffError ? t('file.error.diffUnavailable', { error: diffError }) : null

    useEffect(() => {
        if (!hasDiffContent || diffQuery.data?.success === false) {
            setDisplayMode('file')
        }
    }, [diffQuery.data?.success, hasDiffContent])

    const showModeTabs = hasDiffContent
    const activeMode: DisplayMode = showModeTabs ? displayMode : 'file'

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
                        <DiffDisplay diffContent={diffContent} />
                    ) : decodedContent ? (
                        <CodeBlock
                            code={decodedContent}
                            language={language}
                            highlight="always"
                            showCopyButton={canCopyContent}
                        />
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
