import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const packageName = 'ghcr.io/gae265-meowho/meowho/welfarelens-worker';
const sha256 = /^sha256:[a-f0-9]{64}$/;

export function verifyBenchmarkImage(config, image) {
  const ref = `${packageName}@${config.digest}`;
  const revision = image?.Config?.Labels?.['org.opencontainers.image.revision'];
  if (!sha256.test(config.digest) || !/^[a-f0-9]{40}$/.test(config.commit) ||
      !image?.RepoDigests?.includes(ref) || revision !== config.commit ||
      image.Os !== 'linux' || image.Architecture !== 'amd64' || !sha256.test(image.Id)) {
    throw Error('Benchmark image digest, revision or platform mismatch');
  }
  return { ref, revision, imageId: image.Id };
}

export function verifyLocalM6Image(config, image) {
  const revision = image?.Config?.Labels?.['org.opencontainers.image.revision'];
  if (!sha256.test(config.imageId) || !/^[a-f0-9]{40}$/.test(config.commit) ||
      image?.Id !== config.imageId || revision !== config.commit ||
      image.Os !== 'linux' || image.Architecture !== 'amd64') {
    throw Error('M6 local image ID, revision or platform mismatch');
  }
  return { ref: image.Id, revision, imageId: image.Id };
}

const azureNames = [
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT', 'AZURE_OPENAI_API_KEY',
  'AZURE_IMAGE_ENDPOINT', 'AZURE_IMAGE_DEPLOYMENT', 'AZURE_IMAGE_API_KEY',
];

export function benchmarkAzureEnv(contents) {
  const source = parseEnv(contents);
  return Object.fromEntries(azureNames.map(name => {
    if (!source[name]?.trim() || /[\r\n\0]/.test(source[name])) throw Error(`Missing or invalid ${name}`);
    return [name, source[name]];
  }));
}

export function assertPrivatePath(path) {
  for (let directory = path;; directory = dirname(directory)) {
    if (existsSync(resolve(directory, '.git'))) throw Error('Keep Benchmark input, config and batch outside Git');
    if (dirname(directory) === directory) return;
  }
}

function main() {
  let stage = 'arguments';
  try {
    const { values } = parseArgs({ options: {
      config: { type: 'string' }, input: { type: 'string' }, batch: { type: 'string' },
      'azure-env': { type: 'string' }, run: { type: 'string' },
      'expansion-approval': { type: 'string' },
      'm6-local': { type: 'boolean' }, 'm6-approval': { type: 'string' },
    } });
    const { run, 'expansion-approval': expansionApproval } = values;
    const local = values['m6-local'];
    const localApproval = values['m6-approval'];
    if (!values.config || !values.input || !values.batch || !values['azure-env'] ||
        (run !== undefined && !/^[1-6]$/.test(run)) ||
        (Boolean(expansionApproval) !== (Number(run) >= 3)) ||
        (local ? run !== undefined : localApproval !== undefined)) throw Error('Invalid arguments');
    const configPath = realpathSync(values.config);
    const input = realpathSync(values.input);
    const batch = realpathSync(values.batch);
    const azureEnv = realpathSync(values['azure-env']);
    for (const path of [configPath, input, batch, ...(local ? [azureEnv] : [])]) {
      assertPrivatePath(path);
      if (/[,\r\n]/.test(path)) throw Error('Unsupported bind mount path');
    }
    if (!statSync(batch).isDirectory() || !statSync(configPath).isFile() || !statSync(input).isFile())
      throw Error('Expected private batch directory and two files');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!sha256.test(local ? config.imageId : config.digest) || !/^[a-f0-9]{40}$/.test(config.commit)) throw Error('Invalid image identity');
    if (local && (configPath !== resolve(batch, 'approval.json') ||
        (localApproval !== undefined && localApproval !== config.approvalRef)))
      throw Error('M6 approval must match the original batch');
    stage = 'local Docker connection';
    const env = { ...process.env };
    delete env.DOCKER_HOST;
    delete env.DOCKER_CONTEXT;
    const inspect = args => execFileSync('docker', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const context = inspect(['context', 'show']);
    const [contextInfo] = JSON.parse(inspect(['context', 'inspect', context]));
    if (!/^(?:npipe:\/\/\/\/\.\/pipe\/docker(?:DesktopLinux)?Engine|unix:\/\/\/[^\r\n]+)$/i.test(contextInfo?.Endpoints?.docker?.Host ?? ''))
      throw Error('A local Docker socket is required');
    const docker = ['--context', context];
    stage = 'digest / OCI revision (pull the fixed digest first)';
    const ref = local ? config.imageId : `${packageName}@${config.digest}`;
    const [image] = JSON.parse(inspect([...docker, 'image', 'inspect', ref]));
    const identity = local ? verifyLocalM6Image(config, image) : verifyBenchmarkImage(config, image);
    stage = 'Azure AI key configuration';
    const execute = !!run || localApproval !== undefined;
    // A local offline probe never passes real keys into the test container.
    const azure = benchmarkAzureEnv(readFileSync(azureEnv, 'utf8'));
    if (local && !execute) {
      azure.AZURE_OPENAI_API_KEY = 'offline-preflight';
      azure.AZURE_IMAGE_API_KEY = 'offline-preflight';
    }
    stage = execute ? 'guarded live run' : 'offline runtime preflight';
    const launch = ['run', '--rm', '--pull=never', '--platform', 'linux/amd64'];
    if (!execute) launch.push('--network', 'none');
    if (local) launch.push('--name', 'welfarelens-m6-local');
    if (process.getuid && process.getgid) launch.push('--user', `${process.getuid()}:${process.getgid()}`);
    for (const name of Object.keys(azure)) launch.push('-e', name);
    launch.push(
      '--mount', `type=bind,src=${batch},dst=/batch`,
      '--mount', `type=bind,src=${input},dst=/tmp/cleanroom.mp4,readonly`,
      '--mount', `type=bind,src=${configPath},dst=/tmp/approval.json,readonly`,
      '--entrypoint', 'node', identity.imageId, '--experimental-strip-types', 'scripts/pipeline-benchmark.ts',
      '--config', '/tmp/approval.json', '--input', '/tmp/cleanroom.mp4', '--batch', '/batch',
      '--image-identity', JSON.stringify(identity),
    );
    if (local) launch.push('--m6-local');
    if (!execute) launch.push('--preflight');
    else if (local) launch.push('--m6-approval', localApproval);
    else if (Number(run) <= 2) launch.push('--phase', 'pilot', '--run', run);
    else launch.push('--phase', 'remaining', '--run', run, '--expansion-approval', expansionApproval);
    execFileSync('docker', [...docker, ...launch], { stdio: 'inherit', env: { ...env, ...azure } });
  } catch {
    console.error(`Benchmark stopped at: ${stage}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
