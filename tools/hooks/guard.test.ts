// The validation cycle's guard (tools/hooks/guard.ts): what it lets an agent do, and what it sends back.
import { describe, expect, it } from 'vitest';
import { bashVerdict, commandWords, hookDirectory, pushesMain, repositoryOf, stopVerdict, type State } from './guard.ts';

const at = '2026-09-25T00:00:00.000Z';
const state = (over: Partial<State> = {}): State => ({ working: 'w', head: 'h', checked: 'w', e2e: { tree: 'h', passed: true, at }, verify: { tree: 'h', passed: true, at }, ...over });

describe('the end of a turn', () => {
  it('sends the agent back once when a change was not validated by npm run check', () => {
    expect(stopVerdict(state({ checked: 'old' }), true, null)).toMatch(/npm run check/);
    // once per state of the working tree
    expect(stopVerdict(state({ checked: 'old' }), true, 'w')).toBeNull();
  });
  it('judges the worktree the agent works in, never the main folder', () => {
    const root = 'C:/work/builder';
    expect(hookDirectory('stop', { cwd: 'C:/work/builder/.cache/wt/integration' }, root)).toBe('C:/work/builder/.cache/wt/integration');
    expect(hookDirectory('stop', { cwd: '/c/work/builder/.cache/wt/integration' }, root)).toBe('C:/work/builder/.cache/wt/integration');
    expect(hookDirectory('stop', {}, root)).toBe(root);
    expect(hookDirectory('bash', { cwd: root, tool_input: { command: 'git -C /c/work/builder/.cache/wt/x commit -m y' } }, root)).toBe('C:/work/builder/.cache/wt/x');
  });
  it('lets a validated or clean tree end the turn', () => {
    expect(stopVerdict(state(), true, null)).toBeNull();
    expect(stopVerdict(state({ checked: null }), false, null)).toBeNull();
  });
});

describe('the commands a turn runs', () => {
  it('reads a push or a commit only where the shell runs one, not in a message', () => {
    expect(commandWords("git commit -m 'then git push origin main'")).not.toMatch(/push/);
    expect(commandWords("git commit -F - <<'EOF'\nthen git push origin main\nEOF\ngit status")).not.toMatch(/push/);
    expect(commandWords("git commit -F - <<'EOF'\nbody\nEOF\ngit push")).toMatch(/git push/);
  });
  const on = (current: string, pushesTo = current) => ({ current, pushesTo });
  it('knows a push that updates main', () => {
    expect(pushesMain('git push', on('main'))).toBe(true);
    expect(pushesMain('git push', on('integration'))).toBe(false);
    // a branch of another name whose push goes to main
    expect(pushesMain('git push', on('integration', 'main'))).toBe(true);
    expect(pushesMain('git push -u origin main', on('integration'))).toBe(true);
    expect(pushesMain('git push origin integration:main', on('integration'))).toBe(true);
    expect(pushesMain('git push origin HEAD', on('main', 'x'))).toBe(true);
    expect(pushesMain('git push origin feature/main-menu', on('main'))).toBe(false);
    expect(pushesMain('git fetch && git push origin test-strategy', on('test-strategy', 'main'))).toBe(false);
  });
  it('lets a commit take only a tree npm run check validated', () => {
    expect(bashVerdict('git add -A && git commit -m x', state({ checked: 'old' }), () => on('main'))).toMatch(/npm run check/);
    expect(bashVerdict('git add -A && git commit -m x', state(), () => on('main'))).toBeNull();
  });
  it('lets a push to main take only a commit the whole suite and verify:fast passed on', () => {
    expect(bashVerdict('git push origin main', state(), () => on('integration'))).toBeNull();
    expect(bashVerdict('git push origin main', state({ e2e: { tree: 'h', passed: false, at } }), () => on('integration'))).toMatch(/npm run e2e passing/);
    expect(bashVerdict('git push origin main', state({ verify: { tree: 'older', passed: true, at } }), () => on('integration'))).toMatch(/verify:fast passing/);
    expect(bashVerdict('git push origin feature/x', state({ e2e: undefined }), () => on('feature/x'))).toBeNull();
  });
  it('judges the repository the git command runs in, never the main folder', () => {
    // the directory the hook is given
    expect(repositoryOf('git commit -m x', 'C:/work/builder/.cache/wt/integration')).toBe('C:/work/builder/.cache/wt/integration');
    // the path of git -C, absolute in the shell's form or relative to that directory
    expect(repositoryOf('git -C /c/work/builder/.cache/wt/integration commit -m x', 'C:/work/builder')).toBe('C:/work/builder/.cache/wt/integration');
    expect(repositoryOf('git -C "D:/elsewhere/repo" push origin integration', 'C:/work/builder')).toBe('D:/elsewhere/repo');
    expect(repositoryOf('git -C .cache/wt/integration commit -m x', 'C:/work/builder').replaceAll('\\', '/')).toBe('C:/work/builder/.cache/wt/integration');
    expect(bashVerdict('git -C /c/w commit -m x', state({ checked: 'old' }), () => on('main'))).toMatch(/npm run check/);
    expect(pushesMain('git -C /c/w push origin main', on('integration'))).toBe(true);
  });
  it('lets a commit on any branch but main save the work without npm run check', () => {
    expect(bashVerdict('git add -A && git commit -m x', state({ checked: 'old' }), () => on('integration'))).toBeNull();
    expect(bashVerdict('git -C /c/w commit -m x', state({ checked: null }), () => on('feature/x'))).toBeNull();
    // the push of that branch, not to main, takes nothing either
    expect(bashVerdict('git push origin integration', state({ checked: 'old', e2e: undefined }), () => on('integration'))).toBeNull();
  });
  it('lets through a command that neither commits nor pushes', () => {
    expect(bashVerdict('npm run check', state({ checked: 'old', e2e: undefined }), () => on('main'))).toBeNull();
  });
});
