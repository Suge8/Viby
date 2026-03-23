import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { DirectoryTree } from '@/components/SessionFiles/DirectoryTree'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useGitStatusFiles } from '@/hooks/queries/useGitStatusFiles'
import { useSession } from '@/hooks/queries/useSession'
import { useSessionFileSearch } from '@/hooks/queries/useSessionFileSearch'
import {
    runNavigationTransition,
    VIEW_TRANSITION_NAVIGATION_OPTIONS,
} from '@/lib/navigationTransition'
import { getNoticePreset } from '@/lib/noticePresets'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import { SessionRouteHeader } from '@/routes/sessions/components/SessionRouteHeader'
import { SessionRouteTabs } from '@/routes/sessions/components/SessionRouteTabs'
import { FilesActionButton, FilesSearchBar, GitSummary } from '@/routes/sessions/filesPageChrome'
import { FileListSectionHeader, FileListSkeleton, GitFileRow, SearchResultRow } from '@/routes/sessions/filesPageViews'
import { createFileRouteSearch, getRootLabel, type FilesTab } from '@/routes/sessions/filesPageUtils'

const FILE_TABS: FilesTab[] = ['changes', 'directories']

export default function FilesPage(): ReactNode {
    const { t } = useTranslation()
    const warningPreset = getNoticePreset('genericWarning', t)
    const errorPreset = getNoticePreset('genericError', t)
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const goBack = useAppGoBack()
    const { sessionId } = useParams({ from: '/sessions/$sessionId/files' })
    const search = useSearch({ from: '/sessions/$sessionId/files' })
    const { session } = useSession(api, sessionId)
    const [searchQuery, setSearchQuery] = useState('')

    const activeTab: FilesTab = search.tab === 'directories' ? 'directories' : 'changes'
    const subtitle = session?.metadata?.path ?? sessionId
    const rootLabel = useMemo(() => getRootLabel(subtitle), [subtitle])
    const shouldSearch = searchQuery.trim().length > 0

    const {
        status: gitStatus,
        error: gitError,
        isLoading: gitLoading,
        refetch: refetchGit,
    } = useGitStatusFiles(api, sessionId)

    const searchResults = useSessionFileSearch(api, sessionId, searchQuery, {
        enabled: shouldSearch,
    })

    const handleOpenFile = useCallback((path: string, staged?: boolean) => {
        runNavigationTransition(() => {
            void navigate({
                to: '/sessions/$sessionId/file',
                params: { sessionId },
                search: createFileRouteSearch(path, activeTab, staged),
            })
        }, VIEW_TRANSITION_NAVIGATION_OPTIONS)
    }, [activeTab, navigate, sessionId])

    const handleRefresh = useCallback(() => {
        if (shouldSearch) {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.sessionFiles(sessionId, searchQuery),
            })
            return
        }

        if (activeTab === 'directories') {
            void queryClient.invalidateQueries({
                queryKey: ['session-directory', sessionId],
            })
            return
        }

        void refetchGit()
    }, [activeTab, queryClient, refetchGit, searchQuery, sessionId, shouldSearch])

    const handleTabChange = useCallback((nextTabId: string) => {
        const nextTab: FilesTab = nextTabId === 'directories' ? 'directories' : 'changes'

        runNavigationTransition(() => {
            void navigate({
                to: '/sessions/$sessionId/files',
                params: { sessionId },
                search: nextTab === 'changes' ? {} : { tab: nextTab },
                replace: true,
            })
        }, VIEW_TRANSITION_NAVIGATION_OPTIONS)
    }, [navigate, sessionId])

    const branchLabel = gitStatus?.branch ?? t('files.branch.detached')
    const branchSummary = t('files.branch.summary', {
        staged: gitStatus?.totalStaged ?? 0,
        unstaged: gitStatus?.totalUnstaged ?? 0,
    })

    return (
        <div className="flex h-full flex-col">
            <SessionRouteHeader
                title={t('files.title')}
                subtitle={subtitle}
                onBack={goBack}
                actions={
                    <FilesActionButton
                        onClick={handleRefresh}
                        title={t('files.refresh')}
                    />
                }
            />

            <FilesSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={t('files.search.placeholder')}
            />

            <SessionRouteTabs
                activeId={activeTab}
                items={FILE_TABS.map((tab) => ({
                    id: tab,
                    label: t(tab === 'changes' ? 'files.tab.changes' : 'files.tab.directories'),
                }))}
                onChange={handleTabChange}
            />

            {!gitLoading && gitStatus && !shouldSearch && activeTab === 'changes' ? (
                <GitSummary
                    branchLabel={branchLabel}
                    summaryText={branchSummary}
                />
            ) : null}

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full ds-stage-shell">
                    {gitError && activeTab === 'changes' ? (
                        <SessionRouteBanner
                            tone={warningPreset.tone === 'warning' ? 'warning' : 'neutral'}
                            title={warningPreset.title}
                            description={gitError}
                        />
                    ) : null}

                    {shouldSearch ? (
                        searchResults.isLoading ? (
                            <FileListSkeleton label={t('loading.files')} />
                        ) : searchResults.error ? (
                            <SessionRouteBanner
                                tone="error"
                                title={errorPreset.title}
                                description={searchResults.error}
                            />
                        ) : searchResults.files.length === 0 ? (
                            <div className="p-6 text-sm text-[var(--app-hint)]">{t('files.empty.search')}</div>
                        ) : (
                            <div className="border-t border-[var(--app-divider)]">
                                {searchResults.files.map((file, index) => (
                                    <SearchResultRow
                                        key={`${file.fullPath}-${index}`}
                                        file={file}
                                        onOpen={() => handleOpenFile(file.fullPath)}
                                        rootLabel={t('files.projectRoot')}
                                        showDivider={index < searchResults.files.length - 1}
                                    />
                                ))}
                            </div>
                        )
                    ) : activeTab === 'directories' ? (
                        <DirectoryTree
                            api={api}
                            sessionId={sessionId}
                            rootLabel={rootLabel}
                            onOpenFile={handleOpenFile}
                        />
                    ) : gitLoading ? (
                        <FileListSkeleton label={t('loading.git')} />
                    ) : gitStatus ? (
                        <div>
                            {gitStatus.stagedFiles.length > 0 ? (
                                <div>
                                    <FileListSectionHeader
                                        count={gitStatus.stagedFiles.length}
                                        label={t('files.section.staged')}
                                        toneClassName="text-[var(--app-git-staged-color)]"
                                    />
                                    {gitStatus.stagedFiles.map((file, index) => (
                                        <GitFileRow
                                            key={`staged-${file.fullPath}-${index}`}
                                            file={file}
                                            onOpen={() => handleOpenFile(file.fullPath, file.isStaged)}
                                            rootLabel={t('files.projectRoot')}
                                            showDivider={index < gitStatus.stagedFiles.length - 1 || gitStatus.unstagedFiles.length > 0}
                                        />
                                    ))}
                                </div>
                            ) : null}

                            {gitStatus.unstagedFiles.length > 0 ? (
                                <div>
                                    <FileListSectionHeader
                                        count={gitStatus.unstagedFiles.length}
                                        label={t('files.section.unstaged')}
                                        toneClassName="text-[var(--app-git-unstaged-color)]"
                                    />
                                    {gitStatus.unstagedFiles.map((file, index) => (
                                        <GitFileRow
                                            key={`unstaged-${file.fullPath}-${index}`}
                                            file={file}
                                            onOpen={() => handleOpenFile(file.fullPath, file.isStaged)}
                                            rootLabel={t('files.projectRoot')}
                                            showDivider={index < gitStatus.unstagedFiles.length - 1}
                                        />
                                    ))}
                                </div>
                            ) : null}

                            {gitStatus.stagedFiles.length === 0 && gitStatus.unstagedFiles.length === 0 ? (
                                <div className="p-6 text-sm text-[var(--app-hint)]">{t('files.empty.noChanges')}</div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="p-6 text-sm text-[var(--app-hint)]">{t('files.empty.gitUnavailable')}</div>
                    )}
                </div>
            </div>
        </div>
    )
}
