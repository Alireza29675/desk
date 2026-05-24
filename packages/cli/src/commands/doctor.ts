import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function runDoctor(): Promise<void> {
  const home = process.env.DESK_HOME ?? join(homedir(), '.desk');
  const port = Number(process.env.DESK_PORT ?? 7878);

  const checks: Array<{ label: string; ok: boolean; detail?: string }> = [];

  try {
    if (!existsSync(home)) mkdirSync(home, { recursive: true });
    checks.push({ label: `Data dir writeable: ${home}`, ok: true });
  } catch (e) {
    checks.push({ label: `Data dir writeable: ${home}`, ok: false, detail: (e as Error).message });
  }

  try {
    const probe = Bun.serve({ port, hostname: '127.0.0.1', fetch: () => new Response('ok') });
    probe.stop();
    checks.push({ label: `Port ${port} available`, ok: true });
  } catch (e) {
    checks.push({ label: `Port ${port} available`, ok: false, detail: (e as Error).message });
  }

  try {
    const { buildRegistry } = await import('@desk/server');
    const registry = buildRegistry();
    const counts = [
      registry.listArtifactTypes().length,
      registry.listComponentTypes().length,
      registry.listRelationTypes().length,
    ];
    checks.push({
      label: 'Plugin registry loads',
      ok: true,
      detail: `${counts[0]} artifact types, ${counts[1]} component types, ${counts[2]} relation types.`,
    });
  } catch (e) {
    checks.push({ label: 'Plugin registry loads', ok: false, detail: (e as Error).message });
  }

  for (const check of checks) {
    const mark = check.ok ? '✓' : '✗';
    console.log(`${mark}  ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll good.');
  }
}
