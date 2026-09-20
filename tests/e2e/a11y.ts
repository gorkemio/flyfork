import { evidencePath } from '../evidence-path';
import { writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
export async function axe(page: Page, name: string) {
    const result = await new AxeBuilder({ page }).analyze();
    writeFileSync(evidencePath(`axe-${name}.json`), JSON.stringify({ url: result.url, timestamp: result.timestamp, violations: result.violations, incomplete: result.incomplete.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), passes: result.passes.map(p => p.id) }, null, 2));
    expect(result.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
}
