import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

let connectionSettings: any;

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error('No token');

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

function getAllFiles(dir: string, base: string = ''): { path: string; fullPath: string }[] {
  const results: { path: string; fullPath: string }[] = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = base ? `${base}/${item}` : item;

    if (['.git', 'node_modules', '.expo', '.cache', 'dist', 'web-build', '.local', 'patches', '.config'].includes(item)) continue;
    if (item === 'sync-to-github.ts' && !base) continue;
    if (item.startsWith('.replit')) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllFiles(fullPath, relPath));
    } else {
      if (stat.size > 500000) continue;
      results.push({ path: relPath, fullPath });
    }
  }
  return results;
}

async function pushFile(octokit: Octokit, owner: string, repo: string, filePath: string, fullPath: string): Promise<'created' | 'updated' | 'skipped'> {
  const content = fs.readFileSync(fullPath);
  const base64Content = content.toString('base64');

  let existingSha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({ owner, repo, path: filePath });
    if ('sha' in existing.data) {
      existingSha = existing.data.sha;
      if ('content' in existing.data && existing.data.content) {
        const existingContent = existing.data.content.replace(/\n/g, '');
        if (existingContent === base64Content.replace(/\n/g, '')) {
          return 'skipped';
        }
      }
    }
  } catch {}

  await octokit.repos.createOrUpdateFileContents({
    owner, repo, path: filePath,
    message: existingSha ? `Update ${filePath}` : `Add ${filePath}`,
    content: base64Content, sha: existingSha
  });

  return existingSha ? 'updated' : 'created';
}

async function main() {
  const workspace = '/home/runner/workspace';

  console.log('Step 1: Re-exporting data to JSON...');
  execSync(`npx tsx ${path.join(workspace, 'scripts/export-data.ts')}`, { cwd: workspace, stdio: 'inherit' });

  console.log('\nStep 2: Pushing all files to GitHub...');
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  const owner = 'MagicElf-Ann';
  const repo = 'expathub';

  const files = getAllFiles(workspace);
  console.log(`Found ${files.length} files to sync\n`);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const file of files) {
    try {
      const result = await pushFile(octokit, owner, repo, file.path, file.fullPath);
      if (result === 'created') { created++; console.log(`Created: ${file.path}`); }
      else if (result === 'updated') { updated++; console.log(`Updated: ${file.path}`); }
      else { skipped++; }
    } catch (e: any) {
      errors++;
      console.error(`Error: ${file.path} - ${e.message}`);
    }
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}, Unchanged: ${skipped}, Errors: ${errors}`);
  console.log('\nYour web agent can now pull the latest from GitHub.');
  console.log('On your local machine, run: git pull origin main');
  console.log('Then run: eas update --branch preview --message "Latest changes"');
}

main().catch(e => console.error('Error:', e.message));
