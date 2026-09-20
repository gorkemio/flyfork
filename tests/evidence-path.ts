import { evidenceFile } from '../scripts/verification-paths.mjs';

/** Output-only harness setting; historical fixtures remain read-only. */
export function evidencePath(name: string): string {
    return evidenceFile(name);
}
