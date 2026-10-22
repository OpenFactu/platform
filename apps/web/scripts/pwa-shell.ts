// Only the entry and its static dependencies belong in the offline shell.
// Pre-caching dynamic imports would download every screen on the first visit.
type BundleEntry =
  | { type: 'asset' }
  | { type: 'chunk'; fileName: string; isEntry?: boolean; imports: string[] };

export function collectShellScripts(bundle: Record<string, BundleEntry>): Set<string> {
  const scripts = new Set<string>();
  function visit(chunk: BundleEntry | undefined) {
    if (chunk?.type !== 'chunk' || scripts.has(chunk.fileName)) return;
    scripts.add(chunk.fileName);
    for (const imported of chunk.imports) visit(bundle[imported]);
  }
  for (const chunk of Object.values(bundle)) {
    if (chunk.type === 'chunk' && chunk.isEntry) visit(chunk);
  }
  return scripts;
}
