import { tmpdir } from 'os'
import { join } from 'path'

export const VIBY_BLOBS_DIR_NAME = 'viby-blobs'

export function getVibyBlobsDir(): string {
    return join(tmpdir(), VIBY_BLOBS_DIR_NAME)
}
