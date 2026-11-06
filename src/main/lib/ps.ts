import { execFile } from 'node:child_process'
import type { ExecFileOptions } from 'node:child_process'

export interface PowerShellResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
}

/**
 * Invoke Windows PowerShell with a script file. Arguments are passed as an
 * array (never interpolated into a command string) so file names cannot break
 * out into arbitrary shell commands.
 */
export function runPowerShell(
  scriptPath: string,
  args: string[] = [],
  options: { timeoutMs?: number; maxBuffer?: number } = {}
): Promise<PowerShellResult> {
  return new Promise((resolve) => {
    const execOptions: ExecFileOptions = {
      windowsHide: true,
      timeout: options.timeoutMs ?? 20000,
      maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
      encoding: 'utf8'
    }
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      execOptions,
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed)
        resolve({
          ok: !error,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: error && 'code' in error ? ((error as { code?: number }).code ?? null) : 0,
          timedOut
        })
      }
    )
  })
}
