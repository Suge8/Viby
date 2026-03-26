import { describe, expect, it } from 'vitest';

import {
    buildOptionalDependencies,
    getPlatformPackageName,
    MAIN_PACKAGE_NAME,
    PLATFORM_RELEASE_TARGETS,
    resolveDistTag,
} from '../../scripts/npmReleaseConfig';

describe('npmReleaseConfig', () => {
    it('keeps the scoped main package name as the single publish target', () => {
        expect(MAIN_PACKAGE_NAME).toBe('@singyy/viby');
    });

    it('maps windows runtime builds to the published windows package name', () => {
        const windowsTarget = PLATFORM_RELEASE_TARGETS.find((target) => target.runtimePlatform === 'win32-x64');

        expect(windowsTarget?.packagePlatform).toBe('windows-x64');
        expect(getPlatformPackageName('windows-x64')).toBe('viby-cli-windows-x64');
    });

    it('builds optional dependencies for every published platform package', () => {
        expect(buildOptionalDependencies('0.1.2-rc.1')).toEqual({
            'viby-cli-darwin-arm64': '0.1.2-rc.1',
            'viby-cli-darwin-x64': '0.1.2-rc.1',
            'viby-cli-linux-arm64': '0.1.2-rc.1',
            'viby-cli-linux-x64': '0.1.2-rc.1',
            'viby-cli-windows-x64': '0.1.2-rc.1',
        });
    });

    it('resolves prerelease and stable dist-tags explicitly', () => {
        expect(resolveDistTag('0.1.2-rc.1')).toBe('next');
        expect(resolveDistTag('0.1.2')).toBe('latest');
    });
});
