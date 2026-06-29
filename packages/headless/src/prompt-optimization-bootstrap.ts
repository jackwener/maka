import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface EnsurePromptOptimizationPromptRepoInput {
  promptRepoDir: string;
  program: string;
  systemPrompt: string;
}

export interface PromptOptimizationPromptRepoPaths {
  agentCwdPath: string;
  programPath: string;
  systemPromptPath: string;
}

export async function ensurePromptOptimizationPromptRepo(
  input: EnsurePromptOptimizationPromptRepoInput,
): Promise<PromptOptimizationPromptRepoPaths> {
  const agentCwdPath = join(input.promptRepoDir, 'agent-cwd');
  const programPath = join(input.promptRepoDir, 'program.md');
  const systemPromptPath = join(input.promptRepoDir, 'system_prompt.md');
  await mkdir(agentCwdPath, { recursive: true });

  if (await pathExists(join(input.promptRepoDir, '.git'))) {
    await assertExistingSeedFile(programPath, input.program);
    await assertExistingSeedFile(systemPromptPath, input.systemPrompt);
    await gitOutput(input.promptRepoDir, 'rev-parse', 'HEAD');
    return { agentCwdPath, programPath, systemPromptPath };
  }

  await writeFile(programPath, input.program, 'utf8');
  await writeFile(systemPromptPath, input.systemPrompt, 'utf8');
  await git(input.promptRepoDir, 'init', '-q');
  await git(input.promptRepoDir, 'config', 'user.email', 'rsi@maka.local');
  await git(input.promptRepoDir, 'config', 'user.name', 'RSI Loop');
  await git(input.promptRepoDir, 'add', 'program.md', 'system_prompt.md');
  await git(input.promptRepoDir, 'commit', '-q', '-m', 'seed prompt');
  return { agentCwdPath, programPath, systemPromptPath };
}

async function assertExistingSeedFile(path: string, expected: string): Promise<void> {
  const actual = await readFile(path, 'utf8');
  if (actual !== expected) {
    throw new Error(`existing prompt repo seed files do not match this run: ${path}`);
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}
