// The validation cycle, enforced for the agents working here (.claude/settings.json hooks; docs/testing/README.md,
// "The cycle"): the limited validation after each change, the whole suite at the checkpoint.
//
//   node tools/hooks/guard.ts stop   (Stop) a turn does not end on a change npm run check has not validated: the
//                                    agent is sent back once per state of the working tree
//   node tools/hooks/guard.ts bash   (PreToolUse, Bash and PowerShell) a commit takes a working tree npm run check
//                                    validated; a push to main takes a commit that the whole suite (npm run e2e) and
//                                    npm run verify:fast passed on
//
// It only reads the working tree and the records of the checks (.cache/impact/), apart from the last tree it sent an
// agent back for (.cache/impact/stop.json).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Checkpoint } from '../impact/checkpoint.ts';

export interface State {
  // the git trees of the working tree and of HEAD
  readonly working: string;
  readonly head: string;
  // the tree npm run check last validated: its browser tests and its static checks both ran on it
  readonly checked: string | null;
  readonly e2e: Checkpoint | undefined;
  readonly verify: Checkpoint | undefined;
}

export function stopVerdict(state: State, dirty: boolean, sentBackFor: string | null): string | null {
  if (!dirty || state.checked === state.working || sentBackFor === state.working) return null;
  return 'The working tree has changes that npm run check has not validated. Run npm run check (the limited validation: it runs only what the change can affect, and widens by itself when it cannot tell), then report its result.';
}

// The command as the shell runs it, without what it only carries as text: here-document bodies and quoted strings (a
// commit message that mentions a push is no push).
export function commandWords(command: string): string {
  const lines = command.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    kept.push(line);
    const heredoc = /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/.exec(line);
    if (heredoc) while (i + 1 < lines.length && (lines[i + 1] ?? '').trim() !== heredoc[1]) i += 1;
  }
  return kept.join('\n').replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
}

// Whether a git push in the command updates main: a refspec whose destination is main, HEAD while on main, or no
// refspec while the branch pushes to main (its push destination, which a branch of another name can have).
export function pushesMain(words: string, branch: { readonly current: string; readonly pushesTo: string }): boolean {
  for (const m of words.matchAll(/\bgit\s+push\b([^;&|\n]*)/g)) {
    const args = (m[1] ?? '').trim().split(/\s+/).filter((a) => a !== '' && !a.startsWith('-'));
    // the first argument is the remote, the rest are refspecs
    const refspecs = args.slice(1);
    if (refspecs.length === 0 ? branch.pushesTo === 'main' : refspecs.some((r) => /^(\+?)(.*:)?(refs\/heads\/)?main$/.test(r) || (r === 'HEAD' && branch.current === 'main'))) return true;
  }
  return false;
}

export function bashVerdict(command: string, state: State, branch: () => { readonly current: string; readonly pushesTo: string }): string | null {
  const words = commandWords(command);
  const commits = /\bgit\s+commit\b/.test(words);
  const pushes = /\bgit\s+push\b/.test(words);
  if (!commits && !pushes) return null;
  const s = state;
  if (commits && s.checked !== s.working) return 'git commit: npm run check has not validated this working tree. Run npm run check first; the commit takes a validated tree.';
  if (pushes && pushesMain(words, branch())) {
    const e2e = s.e2e?.tree === s.head && s.e2e.passed;
    const verify = s.verify?.tree === s.head && s.verify.passed;
    if (!e2e || !verify) return `git push to main: main takes only a commit the whole suite and verify:fast passed on (the checkpoint). Missing at this commit: ${[e2e ? null : 'npm run e2e passing', verify ? null : 'npm run verify:fast passing'].filter((x) => x !== null).join(' and ')}.`;
  }
  return null;
}

const git = (...args: string[]) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();

// loaded only when a command commits or pushes: the hook runs before every shell command, and the map's module
// brings the TypeScript compiler with it
async function currentState(): Promise<State> {
  const { readMap, treeOf, workingTree } = await import('../impact/impact.ts');
  const { readStatics } = await import('../impact/statics.ts');
  const { readCheckpoints } = await import('../impact/checkpoint.ts');
  const map = readMap();
  const statics = readStatics();
  const browserTree = map === null ? null : treeOf(map.snapshot);
  const staticTree = statics === null ? null : treeOf(statics.snapshot);
  const checks = readCheckpoints();
  return { working: workingTree(), head: git('rev-parse', 'HEAD^{tree}'), checked: browserTree !== null && browserTree === staticTree ? browserTree : null, e2e: checks.e2e, verify: checks.verify };
}

if (import.meta.main) {
  // the records and git are read from the project's root, wherever the hook runs from
  process.chdir(path.resolve(import.meta.dirname, '..', '..'));
  const mode = process.argv[2];
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') as { stop_hook_active?: boolean; tool_input?: { command?: string } };
  if (mode === 'stop') {
    if (input.stop_hook_active === true) process.exit(0);
    const dirty = git('status', '--porcelain') !== '';
    if (!dirty) process.exit(0);
    const record = path.join('.cache', 'impact', 'stop.json');
    const sentBackFor = fs.existsSync(record) ? (JSON.parse(fs.readFileSync(record, 'utf8')) as { tree: string }).tree : null;
    const state = await currentState();
    const reason = stopVerdict(state, dirty, sentBackFor);
    if (reason !== null) {
      fs.mkdirSync(path.dirname(record), { recursive: true });
      fs.writeFileSync(record, JSON.stringify({ tree: state.working }));
      process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    }
  } else if (mode === 'bash') {
    const command = input.tool_input?.command ?? '';
    if (!/\bgit\s+(commit|push)\b/.test(commandWords(command))) process.exit(0);
    const reason = bashVerdict(command, await currentState(), () => {
      const current = git('rev-parse', '--abbrev-ref', 'HEAD');
      // where a push with no refspec goes (push.default and the upstream decide it); the branch itself when unset
      const destination = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{push}');
      return { current, pushesTo: destination === '' ? current : destination.replace(/^[^/]+\//, '') };
    });
    if (reason !== null) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } else throw new Error('usage: node tools/hooks/guard.ts stop|bash (the hook input on stdin)');
}
