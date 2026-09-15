import { execFileSync } from 'node:child_process';
try {
  const message = execFileSync('git', ['log', '-1', '--format=%s'], {encoding:'utf8'}).trim();
  const names = execFileSync('git', ['diff-tree','--no-commit-id','--name-only','-r','HEAD'], {encoding:'utf8'}).trim().split('\n');
  if(message === 'Upload image asset' && names.length && names.every(name=>/^images\/asset_[a-f0-9]{24}\.webp$/.test(name))) {
    console.log('Image upload is staged; the following state publication will build the gallery.');
    process.exit(0);
  }
} catch { /* Build when Git metadata is unavailable. */ }
process.exit(1);
