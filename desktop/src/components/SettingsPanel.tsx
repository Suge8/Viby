import type { JSX, ReactNode } from 'react'
import { DesktopSegmentedControl } from '@/components/DesktopSegmentedControl'
import { DownloadIcon, LanguageIcon, LinkIcon, RefreshIcon, SpinnerIcon, ThemeLightIcon } from '@/components/icons'
import { StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopUpdateActions, DesktopUpdateState } from '@/hooks/useDesktopUpdates'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { LanguagePreference, ThemePreference } from '@/lib/desktopPreferences'
import type { DesktopEntryMode } from '@/types'

interface SettingsPanelProps {
    updates: DesktopUpdateState & DesktopUpdateActions
    copy: DesktopCopy
    entryMode: DesktopEntryMode
    entryModeDisabled: boolean
    languagePreference: LanguagePreference
    themePreference: ThemePreference
    onEntryModeChange(value: DesktopEntryMode): void
    onLanguagePreferenceChange(value: LanguagePreference): void
    onThemePreferenceChange(value: ThemePreference): void
}

function getPrimaryAction(updates: DesktopUpdateState, copy: DesktopCopy): string {
    if (updates.phase === 'checking') {
        return copy.updateChecking
    }
    if (updates.phase === 'installing') {
        return copy.updateInstalling
    }
    if (updates.update) {
        return copy.updateInstall
    }
    return copy.updateCheck
}

function getThemeOptions(copy: DesktopCopy): Array<{ value: ThemePreference; label: string }> {
    return [
        { value: 'system', label: copy.themeSystem },
        { value: 'light', label: copy.themeLight },
        { value: 'dark', label: copy.themeDark },
    ]
}

function getLanguageOptions(copy: DesktopCopy): Array<{ value: LanguagePreference; label: string }> {
    return [
        { value: 'system', label: copy.languageSystem },
        { value: 'zh', label: copy.languageZh },
        { value: 'en', label: copy.languageEn },
    ]
}

function SettingHeader(props: { icon: ReactNode; title: string; hint?: string }): JSX.Element {
    return (
        <div className="desktop-settings-heading">
            <span className="desktop-settings-heading-icon" aria-hidden="true">
                {props.icon}
            </span>
            <div>
                <strong>{props.title}</strong>
                {props.hint ? <span>{props.hint}</span> : null}
            </div>
        </div>
    )
}

export function SettingsPanel({
    updates,
    copy,
    entryMode,
    entryModeDisabled,
    languagePreference,
    themePreference,
    onEntryModeChange,
    onLanguagePreferenceChange,
    onThemePreferenceChange,
}: SettingsPanelProps): JSX.Element {
    const busy = updates.phase === 'checking' || updates.phase === 'installing'
    const primaryAction = updates.update ? updates.install : updates.checkNow
    const updateActionIcon = busy ? <SpinnerIcon /> : updates.update ? <DownloadIcon /> : <RefreshIcon />

    return (
        <div className="desktop-page">
            <StaggerGroup className="desktop-settings-page" stagger={0.05}>
                <StaggerItem className="desktop-settings-row">
                    <SettingHeader icon={<LanguageIcon />} title={copy.settingsLanguageTitle} />
                    <DesktopSegmentedControl
                        ariaLabel={copy.settingsLanguageTitle}
                        options={getLanguageOptions(copy)}
                        value={languagePreference}
                        onChange={onLanguagePreferenceChange}
                    />
                </StaggerItem>

                <StaggerItem className="desktop-settings-row">
                    <SettingHeader icon={<ThemeLightIcon />} title={copy.settingsThemeTitle} />
                    <DesktopSegmentedControl
                        ariaLabel={copy.settingsThemeTitle}
                        options={getThemeOptions(copy)}
                        value={themePreference}
                        onChange={onThemePreferenceChange}
                    />
                </StaggerItem>

                <StaggerItem className="desktop-settings-row">
                    <SettingHeader
                        icon={<LinkIcon />}
                        title={copy.settingsLanTitle}
                        hint={entryModeDisabled ? copy.settingsLanLocked : copy.settingsLanHint}
                    />
                    <button
                        type="button"
                        className={`desktop-settings-toggle ${entryMode === 'lan' ? 'is-on' : ''}`}
                        role="switch"
                        aria-checked={entryMode === 'lan'}
                        disabled={entryModeDisabled}
                        onClick={() => onEntryModeChange(entryMode === 'lan' ? 'local' : 'lan')}
                    >
                        <span />
                    </button>
                </StaggerItem>

                <StaggerItem className="desktop-settings-update">
                    <SettingHeader
                        icon={<DownloadIcon />}
                        title={copy.settingsUpdateTitle}
                        hint={updates.message ?? copy.settingsUpdateFallback}
                    />
                    <div className="desktop-settings-update-actions">
                        <div className="desktop-settings-inline-toggle">
                            <span id="desktop-auto-update-label">{copy.settingsAutoUpdateTitle}</span>
                            <button
                                type="button"
                                className={`desktop-settings-toggle ${updates.autoCheckEnabled ? 'is-on' : ''}`}
                                role="switch"
                                aria-labelledby="desktop-auto-update-label"
                                aria-checked={updates.autoCheckEnabled}
                                onClick={() => updates.setAutoCheckEnabled(!updates.autoCheckEnabled)}
                            >
                                <span />
                            </button>
                        </div>
                        <button
                            type="button"
                            className="desktop-settings-action"
                            disabled={busy}
                            onClick={() => void primaryAction()}
                        >
                            {updateActionIcon}
                            <span>{getPrimaryAction(updates, copy)}</span>
                        </button>
                    </div>
                </StaggerItem>
            </StaggerGroup>
        </div>
    )
}
