import { homedir } from 'node:os';
import { join } from 'node:path';

export function runWhere(): void {
  const home = process.env.DESK_HOME ?? join(homedir(), '.desk');
  console.log(home);
}
