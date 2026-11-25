/** Pure helpers for editing the local, git-ignored preview values file without exposing values. */

/** Sets NAME=value, replacing an existing NAME line or appending. Never touches other lines. */
export function upsertEnvLine(text: string, name: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Invalid variable name');
  if (/[\r\n]/.test(value)) throw new Error('Value must be a single line (minify JSON first)');
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop(); // trailing newline -> no phantom blank line
  const index = lines.findIndex((l) => l.startsWith(`${name}=`));
  const line = `${name}=${value}`;
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return `${lines.join('\n')}\n`;
}

/** Service-account JSON -> one line, with a sanity check that it is the project we expect. */
export function minifyServiceAccount(raw: string, expectedProjectId: string): string {
  let parsed: { project_id?: unknown; private_key?: unknown; client_email?: unknown };
  try { parsed = JSON.parse(raw) as typeof parsed; } catch { throw new Error('Not valid JSON'); }
  if (parsed.project_id !== expectedProjectId) {
    throw new Error(`The key belongs to a different project than ${expectedProjectId}; refusing to store it`);
  }
  if (typeof parsed.private_key !== 'string' || typeof parsed.client_email !== 'string') throw new Error('Not a service-account key (missing private_key/client_email)');
  return JSON.stringify(parsed);
}

/** NAMEs present in the file, for a values-free status listing. */
export function namesIn(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => /^[A-Z][A-Z0-9_]*=.+/.test(l)).map((l) => l.slice(0, l.indexOf('=')));
}
