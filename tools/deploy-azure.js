// @ts-check

import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const resourceGroup = process.env.AZURE_RESOURCE_GROUP || 'rg-quire';
const appName = process.env.AZURE_STATIC_WEB_APP || 'quire-markgar';
const subscription = process.env.AZURE_SUBSCRIPTION;

/** @param {string[]} args */
function az(args) {
  const scoped = subscription ? [...args, '--subscription', subscription] : args;
  return execFileSync('az', scoped, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

try {
  az(['account', 'show', '--query', 'id', '--output', 'tsv']);
  az([
    'staticwebapp',
    'show',
    '--name',
    appName,
    '--resource-group',
    resourceGroup,
    '--query',
    'name',
    '--output',
    'tsv',
  ]);
} catch {
  console.error(
    `Azure Static Web App ${resourceGroup}/${appName} was not found. ` +
      'Select its subscription with az account set or set AZURE_SUBSCRIPTION.',
  );
  process.exit(1);
}

const token = az([
  'staticwebapp',
  'secrets',
  'list',
  '--name',
  appName,
  '--resource-group',
  resourceGroup,
  '--query',
  'properties.apiKey',
  '--output',
  'tsv',
]);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  [
    '--yes',
    '@azure/static-web-apps-cli@2.0.10',
    'deploy',
    'dist',
    '--env',
    'production',
    '--swa-config-location',
    'dist',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, SWA_CLI_DEPLOYMENT_TOKEN: token },
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
