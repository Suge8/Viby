import { join } from 'path'
import { tmpdir } from 'os'

export const VIBY_BLOBS_DIR_NAME = 'viby-blobs'

export function getVibyBlobsDir(): string {
    return join(tmpdir(), VIBY_BLOBS_DIR_NAME)
}
