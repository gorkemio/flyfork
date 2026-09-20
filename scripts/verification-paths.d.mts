import type { PlaywrightTestConfig } from '@playwright/test';
export function evidenceFile(name: string): string;
export function assertRun(run: string): string;
export function browserRunMode(): string;
export function browserOutputs(base: PlaywrightTestConfig, run: string): Pick<PlaywrightTestConfig, 'outputDir' | 'reporter'>;
