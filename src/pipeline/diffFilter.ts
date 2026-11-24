export class DiffFilter {
  private static readonly IGNORED_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.vsix',
    '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz',
    '.map'
  ]);

  private static readonly IGNORED_FILENAMES = new Set([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'cargo.lock',
    'gemfile.lock',
    'composer.lock',
    'poetry.lock',
    'bun.lockb'
  ]);

  /**
   * Filters out high-noise chunks (lockfiles, minified files, assets) from a git diff.
   * If all files are excluded, falls back to the original diff to prevent empty prompts.
   */
  public static filter(diff: string): string {
    if (!diff || !diff.includes('diff --git')) {
      return diff;
    }

    // Split diff into individual file chunks
    const chunks = diff.split(/(?=diff --git)/g);
    const retainedChunks: string[] = [];

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      const firstLine = chunk.split('\n')[0] || '';
      // Match "diff --git a/path/to/file b/path/to/file"
      const match = firstLine.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        const filePath = match[2] || match[1];
        if (DiffFilter.isIgnoredFile(filePath)) {
          continue; // Skip noise file chunk
        }
      }

      retainedChunks.push(chunk);
    }

    const filtered = retainedChunks.join('');
    // Safe fallback: if everything was filtered, return original diff
    return filtered.trim().length > 0 ? filtered : diff;
  }

  private static isIgnoredFile(filePath: string): boolean {
    const normalized = filePath.toLowerCase().trim();
    const fileName = normalized.split('/').pop() || normalized;

    // Check exact lockfile names
    if (DiffFilter.IGNORED_FILENAMES.has(fileName)) {
      return true;
    }

    // Check minified extensions
    if (fileName.endsWith('.min.js') || fileName.endsWith('.min.css')) {
      return true;
    }

    // Check binary/asset extensions
    for (const ext of DiffFilter.IGNORED_EXTENSIONS) {
      if (fileName.endsWith(ext)) {
        return true;
      }
    }

    return false;
  }
}
