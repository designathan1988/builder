// The measurement harness (docs/testing/README.md): runs one command exactly as given and reports what it cost, the
// same way before and after any change to the test strategy.
//
//   node tools/measure/measure.ts --label <name> [--note <text>] -- <command ...>
//
// It records the wall time; the machine's CPU (average and the highest one-second window, from os.cpus()); the
// memory in use; and, for the command's own process tree only (every process whose parent chain reaches the command),
// the CPU-seconds by kind of process, the most processes alive at once, their peak memory, and the processes still
// alive after the command ended (orphans, which it then ends). The command's whole output goes to .cache/logs/, and
// one JSON line per run is appended to .cache/measure/results.jsonl. The tests the command ran are read from the
// runners' own summary lines (Playwright, Vitest) and from the limited validation's selection line.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

interface Proc {
  readonly pid: number;
  readonly ppid: number;
  readonly name: string;
  readonly cpu: number; // seconds of user plus kernel time so far
  readonly memory: number; // bytes, working set
  readonly command: string;
}

function parseArgs(argv: readonly string[]): { label: string; note: string; command: string } {
  const split = argv.indexOf('--');
  if (split < 0 || split === argv.length - 1) throw new Error('usage: node tools/measure/measure.ts --label <name> [--note <text>] -- <command ...>');
  const options = argv.slice(0, split);
  const value = (flag: string) => {
    const at = options.indexOf(flag);
    return at >= 0 ? (options[at + 1] ?? '') : '';
  };
  const label = value('--label');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) throw new Error(`--label must be lower-case letters, digits and dashes, got "${label}"`);
  return { label, note: value('--note'), command: argv.slice(split + 1).join(' ') };
}

// The process table, one snapshot per second, from a single long-lived sampler process so that sampling costs the
// same small amount before and after.
function startProcessSampler(onSnapshot: (procs: Proc[]) => void): () => void {
  if (process.platform === 'win32') {
    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      'while ($true) {',
      '  $rows = Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}`t{3}`t{4}`t{5}" -f $_.ProcessId, $_.ParentProcessId, $_.Name, ($_.KernelModeTime + $_.UserModeTime), $_.WorkingSetSize, (($_.CommandLine -replace "`t", " ") -replace "`r|`n", " ") }',
      '  [Console]::Out.WriteLine(($rows -join [char]1))',
      '  [Console]::Out.Flush()',
      '  Start-Sleep -Milliseconds 1000',
      '}',
    ].join('\n');
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line !== '') {
          onSnapshot(
            line.split('\u0001').flatMap((row) => {
              const [pid, ppid, name, cpu, memory, ...command] = row.split('\t');
              if (pid === undefined || ppid === undefined) return [];
              return [{ pid: Number(pid), ppid: Number(ppid), name: name ?? '', cpu: Number(cpu ?? 0) / 1e7, memory: Number(memory ?? 0), command: command.join(' ') }];
            }),
          );
        }
        newline = buffer.indexOf('\n');
      }
    });
    return () => child.kill();
  }
  const timer = setInterval(() => {
    const out = spawnSync('ps', ['-eo', 'pid=,ppid=,comm=,times=,rss=,args='], { encoding: 'utf8' }).stdout;
    onSnapshot(
      out.split('\n').flatMap((line) => {
        const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
        return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), name: m[3] ?? '', cpu: Number(m[4]), memory: Number(m[5]) * 1024, command: m[6] ?? '' }] : [];
      }),
    );
  }, 1000);
  return () => clearInterval(timer);
}

function kindOf(p: Proc): string {
  const name = p.name.toLowerCase();
  const cmd = p.command;
  if (name.startsWith('chrome')) {
    if (cmd.includes('--type=renderer')) return 'chrome renderer';
    if (cmd.includes('--type=gpu-process')) return 'chrome gpu';
    if (cmd.includes('--type=')) return 'chrome utility';
    return 'chrome browser';
  }
  if (name.startsWith('node')) {
    if (/vitest/.test(cmd)) return 'node vitest';
    if (/vite/.test(cmd)) return 'node vite';
    if (/workerProcessEntry/.test(cmd)) return 'node playwright worker';
    if (/playwright/.test(cmd)) return 'node playwright runner';
    if (/eslint/.test(cmd)) return 'node eslint';
    if (/\btsc\b|typescript/.test(cmd)) return 'node tsc';
    return 'node other';
  }
  return name.replace(/\.exe$/, '');
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.idle + c.times.user + c.times.sys + c.times.irq + c.times.nice;
  }
  return { idle, total };
}

// Every test count a runner prints in its summary, and the limited validation's selection line.
function testCounts(raw: string): Record<string, number> {
  // runners may colour their summary even when asked not to
  const log = stripVTControlCharacters(raw);
  const counts: Record<string, number> = {};
  for (const m of log.matchAll(/^\s+(\d+) (passed|failed|flaky|skipped|did not run|interrupted)\b/gm)) counts[`playwright ${m[2]}`] = (counts[`playwright ${m[2]}`] ?? 0) + Number(m[1]);
  for (const m of log.matchAll(/^\s*Tests\s+(\d+) passed/gm)) counts['vitest passed'] = (counts['vitest passed'] ?? 0) + Number(m[1]);
  for (const m of log.matchAll(/^\s*Tests\s+.*?(\d+) failed/gm)) counts['vitest failed'] = (counts['vitest failed'] ?? 0) + Number(m[1]);
  for (const m of log.matchAll(/^check: selected (\d+) of (\d+) browser tests/gm)) {
    counts['selected'] = Number(m[1]);
    counts['of'] = Number(m[2]);
  }
  return counts;
}

const { label, note, command } = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
fs.mkdirSync('.cache/logs', { recursive: true });
fs.mkdirSync('.cache/measure', { recursive: true });
const logPath = path.join('.cache', 'logs', `measure-${label}-${stamp}.log`);
const log = fs.createWriteStream(logPath);

const lastSeen = new Map<number, Proc>();
const parents = new Map<number, number>(); // pid -> ppid, kept after the process ends
let rootPid = -1;
let maxAlive = 0;
let peakTreeMemory = 0;
let peakMachineCpu = 0;
let peakMachineMemory = 0;
let latest: Proc[] = [];
let window = cpuTimes();

const descends = (pid: number): boolean => {
  let at = pid;
  for (let hop = 0; hop < 64 && at > 0; hop += 1) {
    if (at === rootPid) return true;
    const up = parents.get(at);
    if (up === undefined || up === at) return false;
    at = up;
  }
  return false;
};

const stopSampler = startProcessSampler((procs) => {
  latest = procs;
  const now = cpuTimes();
  const busy = 1 - (now.idle - window.idle) / Math.max(1, now.total - window.total);
  window = now;
  peakMachineCpu = Math.max(peakMachineCpu, busy * 100);
  peakMachineMemory = Math.max(peakMachineMemory, os.totalmem() - os.freemem());
  if (rootPid < 0) return;
  for (const p of procs) if (!parents.has(p.pid)) parents.set(p.pid, p.ppid);
  const tree = procs.filter((p) => p.pid !== rootPid && descends(p.pid));
  for (const p of tree) lastSeen.set(p.pid, p);
  maxAlive = Math.max(maxAlive, tree.length);
  peakTreeMemory = Math.max(peakTreeMemory, tree.reduce((sum, p) => sum + p.memory, 0));
});

// the sampler needs a moment before the first snapshot
await new Promise((r) => setTimeout(r, 2500));
const memoryBefore = os.totalmem() - os.freemem();
peakMachineCpu = 0;
const cpuBefore = cpuTimes();
const started = Date.now();
const child = spawn(command, { shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
rootPid = child.pid ?? -1;
child.stdout.on('data', (chunk: Buffer) => log.write(chunk));
child.stderr.on('data', (chunk: Buffer) => log.write(chunk));
const exitCode: number = await new Promise((resolve) => child.on('close', (code) => resolve(code ?? 1)));
const wall = (Date.now() - started) / 1000;
const cpuAfter = cpuTimes();
await new Promise<void>((resolve) => log.end(resolve));

// processes of the tree still alive shortly after the command ended are orphans; the harness ends them
await new Promise((r) => setTimeout(r, 3000));
const orphans = latest.filter((p) => p.pid !== rootPid && descends(p.pid));
for (const o of orphans) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(o.pid), '/T', '/F']);
  else spawnSync('kill', ['-9', String(o.pid)]);
}
stopSampler();

const machineCpu = 100 * (1 - (cpuAfter.idle - cpuBefore.idle) / Math.max(1, cpuAfter.total - cpuBefore.total));
const byKind: Record<string, number> = {};
for (const p of lastSeen.values()) byKind[kindOf(p)] = (byKind[kindOf(p)] ?? 0) + p.cpu;
const treeCpu = Object.values(byKind).reduce((a, b) => a + b, 0);
const output = fs.readFileSync(logPath, 'utf8');
const result = {
  label,
  note,
  command,
  at: new Date().toISOString(),
  commit: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  dirtyFiles: spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.trim() !== '').length,
  exitCode,
  wallSeconds: Number(wall.toFixed(1)),
  machineCpuAvgPercent: Number(machineCpu.toFixed(1)),
  machineCpuPeakPercent: Number(peakMachineCpu.toFixed(0)),
  machineCpuSeconds: Number(((machineCpu / 100) * wall * os.cpus().length).toFixed(0)),
  treeCpuSeconds: Number(treeCpu.toFixed(0)),
  treeCpuByKind: Object.fromEntries(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Number(v.toFixed(0))])),
  maxProcessesAtOnce: maxAlive,
  peakTreeMemoryMB: Math.round(peakTreeMemory / 2 ** 20),
  machineMemoryPeakDeltaMB: Math.round((peakMachineMemory - memoryBefore) / 2 ** 20),
  orphans: orphans.map((o) => `${o.name} ${o.pid}`),
  tests: testCounts(output),
  log: logPath.replace(/\\/g, '/'),
};
fs.appendFileSync(path.join('.cache', 'measure', 'results.jsonl'), `${JSON.stringify(result)}\n`);
console.log(
  `measure ${label}: exit ${exitCode} | ${result.wallSeconds} s | machine CPU avg ${result.machineCpuAvgPercent}% peak ${result.machineCpuPeakPercent}% (${result.machineCpuSeconds} CPU-s) | tree ${result.treeCpuSeconds} CPU-s, ${maxAlive} processes at once, ${result.peakTreeMemoryMB} MB peak | orphans ${orphans.length} | tests ${JSON.stringify(result.tests)}`,
);
for (const [k, v] of Object.entries(result.treeCpuByKind).slice(0, 8)) console.log(`  ${k.padEnd(24)} ${String(v).padStart(6)} CPU-s`);
console.log(`  log: ${result.log}`);
process.exit(exitCode);
