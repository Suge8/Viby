import type { JSX, ReactNode } from 'react'
import { DesktopSegmentedControl } from '@/components/DesktopSegmentedControl'
import { DesktopToggle } from '@/components/DesktopToggle'
import {
    DoorIcon,
    DownloadIcon,
    GithubIcon,
    LanguageIcon,
    RefreshIcon,
    SpinnerIcon,
    ThemeLightIcon,
} from '@/components/icons'
import { StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopUpdateActions, DesktopUpdateState } from '@/hooks/useDesktopUpdates'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { LanguagePreference, ThemePreference } from '@/lib/desktopPreferences'

const PROJECT_URL = 'https://github.com/Suge8/Viby'

interface SettingsPanelProps {
    updates: DesktopUpdateState & DesktopUpdateActions
    copy: DesktopCopy
    languagePreference: LanguagePreference
    themePreference: ThemePreference
    onLanguagePreferenceChange(value: LanguagePreference): void
    onOpenUrl(url: string): void
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

function SettingsCta(props: { disabled?: boolean; icon: ReactNode; label: string; onClick(): void }): JSX.Element {
    return (
        <button type="button" className="desktop-settings-cta" disabled={props.disabled} onClick={props.onClick}>
            {props.icon}
            <span>{props.label}</span>
        </button>
    )
}

export function SettingsPanel({
    updates,
    copy,
    languagePreference,
    themePreference,
    onLanguagePreferenceChange,
    onOpenUrl,
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

                <StaggerItem className="desktop-settings-update">
                    <SettingHeader
                        icon={<DownloadIcon />}
                        title={copy.settingsUpdateTitle}
                        hint={updates.message ?? copy.settingsUpdateFallback}
                    />
                    <div className="desktop-settings-update-actions">
                        <div className="desktop-settings-inline-toggle">
                            <span id="desktop-auto-update-label">{copy.settingsAutoUpdateTitle}</span>
                            <DesktopToggle
                                checked={updates.autoCheckEnabled}
                                labelId="desktop-auto-update-label"
                                onClick={() => updates.setAutoCheckEnabled(!updates.autoCheckEnabled)}
                            />
                        </div>
                        <SettingsCta
                            disabled={busy}
                            icon={updateActionIcon}
                            label={getPrimaryAction(updates, copy)}
                            onClick={() => void primaryAction()}
                        />
                    </div>
                </StaggerItem>

                <StaggerItem className="desktop-settings-github">
                    <SettingHeader
                        icon={<GithubIcon />}
                        title={copy.settingsGithubTitle}
                        hint={copy.settingsGithubHint}
                    />
                    <SettingsCta
                        icon={<DoorIcon />}
                        label={copy.settingsGithubAction}
                        onClick={() => onOpenUrl(PROJECT_URL)}
                    />
                </StaggerItem>
            </StaggerGroup>
        </div>
    )
}
