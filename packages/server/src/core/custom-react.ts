import { DeskError, validationFailed } from './errors';

/**
 * Server-side validation + compilation for `custom-react` components.
 *
 * The authoring loop: the agent writes natural TSX; a syntax error is
 * rejected AT THE WRITE BOUNDARY (create/patch) with the transpiler's own
 * message, so the model gets an immediate, specific fix-it signal instead of
 * a silently broken artifact. The viewer's sandbox harness then fetches
 * COMPILED JS from `GET /api/a/:id/components/:componentId/compiled` — classic
 * `React.createElement` output, so the only global the code needs is React.
 *
 * Bounds (so a pathological payload can't wedge the server): the size cap is
 * the primary bound — it caps parse work, and parsing never executes user
 * code. Write-time validation is synchronous (the service mutation path is
 * sync), so the cap is its whole protection; the async read-time compile
 * additionally carries a hard timeout.
 */

export const MAX_CUSTOM_CODE_BYTES = 64 * 1024;
const COMPILE_TIMEOUT_MS = 2000;

const transpiler = new Bun.Transpiler({
  loader: 'tsx',
  // Classic JSX runtime: emits React.createElement(...) — no jsx-runtime
  // import for the sandbox to resolve.
  tsconfig: JSON.stringify({ compilerOptions: { jsx: 'react' } }),
});

/** The shape the runtime contract requires: the code defines `Component`. */
const DEFINES_COMPONENT = /\b(?:function|const|let|var|class)\s+Component\b/;

/**
 * Write-time gate. Throws `validationFailed` (→ HTTP/MCP 400) with a precise
 * message; never stores code that cannot compile.
 */
export function validateCustomReactCode(data: unknown): void {
  const code = (data as { code?: unknown }).code;
  if (typeof code !== 'string') return; // the plugin schema already rejects this
  if (Buffer.byteLength(code, 'utf8') > MAX_CUSTOM_CODE_BYTES) {
    throw validationFailed(
      `custom-react code exceeds ${MAX_CUSTOM_CODE_BYTES / 1024} KB — keep components self-contained and small.`,
    );
  }
  try {
    transpiler.transformSync(code);
  } catch (e) {
    throw validationFailed(`custom-react code failed to compile: ${(e as Error).message}`);
  }
  if (!DEFINES_COMPONENT.test(code)) {
    throw validationFailed(
      'custom-react code must define `Component` (e.g. `function Component(props) { … }` or `const Component = (props) => …`).',
    );
  }
}

// Read-time compile cache, keyed by content hash — repeat mounts of the same
// code skip the transpile entirely.
const compileCache = new Map<string, string>();
const CACHE_MAX_ENTRIES = 256;

export async function compileCustomReact(code: string): Promise<string> {
  const key = Bun.hash(code).toString(36);
  const hit = compileCache.get(key);
  if (hit !== undefined) return hit;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const compiled = await Promise.race([
      transpiler.transform(code),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(validationFailed('custom-react compile timed out.')),
          COMPILE_TIMEOUT_MS,
        );
      }),
    ]);
    if (compileCache.size >= CACHE_MAX_ENTRIES) compileCache.clear();
    compileCache.set(key, compiled);
    return compiled;
  } catch (e) {
    throw e instanceof DeskError
      ? e
      : validationFailed(`custom-react code failed to compile: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
