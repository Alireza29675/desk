import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Author, Component } from '@desk/types';
import { buildHttpApp } from '../http/app';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { RealtimeHub } from '../ws/hub';
import { DeskService } from './service';

const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;

const GOOD_TSX = `
function Component({ theme, label }: { theme: string; label?: string }) {
  const [count, setCount] = React.useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      {label ?? 'count'}: {count} ({theme})
    </button>
  );
}
`;

const customReact = (code: string, id = 'cr-1'): Component =>
  ({ id, type: 'custom-react', data: { code, props: { label: 'taps' } } }) as unknown as Component;

let db: Database;
let svc: DeskService;

beforeEach(() => {
  db = openDatabase(':memory:');
  svc = new DeskService({ db, registry: buildRegistry(), hub: new RealtimeHub(), autoCommitMs: 0 });
});
afterEach(() => db.close());

function create(code: string) {
  return svc.createArtifact({
    type: 'enriched-document',
    author: agent,
    initialContent: { title: 'Doc', components: [customReact(code)] },
  });
}

describe('custom-react — write-time validation (the authoring loop)', () => {
  test('valid TSX is accepted', () => {
    const a = create(GOOD_TSX);
    expect(a.version).toBe(1);
  });

  test('a syntax error rejects the create with the transpiler message', () => {
    expect(() => create('function Component( { return <div>; }')).toThrow(/failed to compile/);
  });

  test('a syntax error rejects a PATCH too — broken code never lands in the store', () => {
    const a = create(GOOD_TSX);
    expect(() =>
      svc.patchArtifact({
        id: a.id,
        patch: { components: [customReact('const Component = <<<')] },
        author: agent,
      }),
    ).toThrow(/failed to compile/);
    // The stored code is still the good one.
    const stored = svc.getArtifact(a.id).content.components[0]?.data as { code: string };
    expect(stored.code).toBe(GOOD_TSX);
  });

  test('code that never defines Component is rejected with the contract message', () => {
    expect(() => create('const x = 1;')).toThrow(/must define `Component`/);
  });

  test('arrow-function and class definitions of Component pass the contract check', () => {
    expect(() => create('const Component = () => <div>hi</div>;')).not.toThrow();
    expect(() =>
      create('class Component extends React.Component { render() { return <div/>; } }'),
    ).not.toThrow();
  });
});

describe('custom-react — the compiled endpoint (what the sandbox runs)', () => {
  test('serves classic React.createElement output with no jsx-runtime import', async () => {
    const app = buildHttpApp(svc);
    const a = create(GOOD_TSX);
    const res = await app.fetch(new Request(`http://t/api/a/${a.id}/components/cr-1/compiled`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    const js = await res.text();
    expect(js).toContain('React.createElement');
    expect(js).not.toContain('jsx-runtime');
    // Types are erased — it's plain JS now.
    expect(js).not.toContain(': string');
  });

  test('404 for a missing component, 400 for a non-custom-react component', async () => {
    const app = buildHttpApp(svc);
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [
          { id: 'co', type: 'callout', data: { tone: 'info', title: 'T', body: 'B' } } as never,
        ],
      },
    });
    const missing = await app.fetch(new Request(`http://t/api/a/${a.id}/components/nope/compiled`));
    expect(missing.status).toBe(404);
    const wrongType = await app.fetch(new Request(`http://t/api/a/${a.id}/components/co/compiled`));
    expect(wrongType.status).toBe(400);
  });

  test('compiling twice returns identical output (cache path)', async () => {
    const a = create(GOOD_TSX);
    const first = await svc.compiledComponent(a.id, 'cr-1');
    const second = await svc.compiledComponent(a.id, 'cr-1');
    expect(second).toBe(first);
  });
});
