export const MAIN_PACKAGE_NAME = '@singyy/viby';
export const OFFICIAL_NPM_REGISTRY = 'https://registry.npmjs.org';

export interface PlatformReleaseTarget {
    readonly runtimePlatform: string;
    readonly packagePlatform: string;
    readonly os: string;
    readonly cpu: string;
    readonly buildTarget: string;
    readonly binName: string;
}

export const PLATFORM_RELEASE_TARGETS: readonly PlatformReleaseTarget[] = [
    {
        runtimePlatform: 'darwin-arm64',
        packagePlatform: 'darwin-arm64',
        os: 'darwin',
        cpu: 'arm64',
        buildTarget: 'bun-darwin-arm64',
        binName: 'viby',
    },
    {
        runtimePlatform: 'darwin-x64',
        packagePlatform: 'darwin-x64',
        os: 'darwin',
        cpu: 'x64',
        buildTarget: 'bun-darwin-x64',
        binName: 'viby',
    },
    {
        runtimePlatform: 'linux-arm64',
        packagePlatform: 'linux-arm64',
        os: 'linux',
        cpu: 'arm64',
        buildTarget: 'bun-linux-arm64',
        binName: 'viby',
    },
    {
        runtimePlatform: 'linux-x64',
        packagePlatform: 'linux-x64',
        os: 'linux',
        cpu: 'x64',
        buildTarget: 'bun-linux-x64-baseline',
        binName: 'viby',
    },
    {
        runtimePlatform: 'win32-x64',
        packagePlatform: 'windows-x64',
        os: 'win32',
        cpu: 'x64',
        buildTarget: 'bun-windows-x64',
        binName: 'viby.exe',
    },
] as const;

export function getPlatformPackageName(packagePlatform: string): string {
    return `viby-cli-${packagePlatform}`;
}

export function buildOptionalDependencies(version: string): Record<string, string> {
    const optionalDependencies: Record<string, string> = {};

    for (const platform of PLATFORM_RELEASE_TARGETS) {
        optionalDependencies[getPlatformPackageName(platform.packagePlatform)] = version;
    }

    return optionalDependencies;
}

export function resolveDistTag(version: string): 'latest' | 'next' {
    if (version.includes('-')) {
        return 'next';
    }

    return 'latest';
}
