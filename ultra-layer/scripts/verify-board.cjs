#!/usr/bin/env node
const { fs, path, assert, config, fingerprints, hash, validate } = require('./board-lib.cjs');
(async () => {
  if (!process.argv[2]) throw new Error('Usage: verify-board.cjs board-config.json');
  const c = config(process.argv[2]);
  const html = fs.readFileSync(path.join(c.root, 'figma-clipboard.html'), 'utf8');
  const report = JSON.parse(fs.readFileSync(path.join(c.root, 'capture-report.json'), 'utf8'));
  assert.deepEqual(fingerprints(c), report.sourceFiles, 'STALE SNAPSHOT: source files changed. Capture again.');
  assert.equal(hash(html), report.clipboardSha256, 'Clipboard payload differs from capture report');
  if (c.copyPage) assert(report.copyUiVerified, 'Configured copy page has not passed its button test');
  const result = await validate(html, c);
  console.log(JSON.stringify({passed: true, ...result, figmaPasteVerified: false}, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
