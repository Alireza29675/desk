/** Open a URL in the operator's default browser, best-effort. */
export async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const bin = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    await Bun.spawn([bin, url], { stdout: 'ignore', stderr: 'ignore' }).exited;
  } catch {
    /* the URL is already printed, so a failed launch is recoverable */
  }
}
