// Local daily job, run by launchd. Node-only so exactly ONE binary needs macOS
// Full Disk Access (the project lives under ~/Desktop, a TCC-protected folder).
// Chain: rebuild dataset -> crash-safe sync to Supabase (keepalive) -> write the
// Desktop status file. Any step's output is inherited to launchd's log.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath; // the same node launchd used
const run = (args) => execFileSync(node, args, { cwd: ROOT, stdio: 'inherit' });

console.log(`===== ${new Date().toString()} =====`);
run(['scripts/buildFromAssist.js']);
run(['--env-file=web/.env.local', 'src/migrateToSupabase.js']);
run(['--env-file=web/.env.local', 'scripts/writeStatus.mjs', 'daily update']);
console.log('done.');
