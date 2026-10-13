#!/usr/bin/env node
const { fs, path, assert, dep, config, fingerprints, validate } = require('./board-lib.cjs');
(async () => {
  const [configFile, baseUrl, scriptFile] = process.argv.slice(2);
  if (!configFile || !baseUrl || !scriptFile) throw new Error('Usage: capture-board.cjs board-config.json http://127.0.0.1:PORT vendor/capture.js');
  const origin = new URL(baseUrl);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Only local project URLs are supported');
  const c = config(configFile);
  const before = fingerprints(c);
  const { chromium } = dep('playwright');
  const options = { headless: true };
  if (process.env.BOARD_CHROME) options.executablePath = process.env.BOARD_CHROME;
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext({viewport: {width: Math.ceil(c.width), height: Math.ceil(c.height)}, permissions: ['clipboard-read', 'clipboard-write']});
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const url = new URL(c.page, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    assert.equal(url.origin, origin.origin, 'Page must belong to local project');
    await page.goto(url.href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode()));
    });
    const webFonts = await page.evaluate(() => [...document.fonts].map(f => ({family: f.family, weight: f.weight, status: f.status})));
    if (c.fontFamily) {
      const selected = webFonts.filter(f => f.family.replaceAll('"', '') === c.fontFamily);
      assert(selected.length && selected.every(f => f.status === 'loaded'), 'Expected web fonts must be declared and loaded');
    }
    await page.locator(c.selector).screenshot({path: path.join(c.root, 'board-preview.png')});
    await page.addScriptTag({path: path.resolve(scriptFile)});
    // The official Promise settles only when its floating toolbar is closed.
    // Observe a bounded success/error signal, then verify the actual clipboard.
    const eventPromise = page.waitForEvent('console', { timeout: 30000, predicate: m =>
      m.text().includes('[Figma Capture]') && (m.text().includes('Success! Capture copied to clipboard.') || m.type() === 'error')
    });
    const invoke = page.evaluate(selector => {
      if (!window.figma?.captureForDesign) throw new Error('Official captureForDesign API is unavailable');
      void window.figma.captureForDesign({selector, verbose: true});
    }, c.selector);
    const [event] = await Promise.all([eventPromise, invoke]);
    assert(event.text().includes('Success! Capture copied to clipboard.'), event.text());
    const html = await page.evaluate(async () => {
      for (const item of await navigator.clipboard.read())
        if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
      return '';
    });
    const result = await validate(html, c);
    assert.deepEqual(fingerprints(c), before, 'Project changed during capture; run capture again');
    const report = { ...result, capturedAt: new Date().toISOString(), webFonts, sourceFiles: before, copyUiVerified: false, figmaPasteVerified: false };
    fs.writeFileSync(path.join(c.root, 'figma-clipboard.html'), html);
    fs.writeFileSync(path.join(c.root, 'capture-report.json'), JSON.stringify(report, null, 2));
    if (c.copyPage) {
      const copyUrl = new URL(c.copyPage, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
      assert.equal(copyUrl.origin, origin.origin, 'Copy page must belong to local project');
      await page.goto(copyUrl.href);
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.evaluate(() => navigator.clipboard.writeText('copy-test'));
        await page.locator(c.copyButton || '#copy-board').click();
        await page.waitForFunction(async () => {
          for (const item of await navigator.clipboard.read())
            if (item.types.includes('text/html')) return true;
          return false;
        }, null, {timeout: 10000});
        const copied = await page.evaluate(async () => {
          for (const item of await navigator.clipboard.read())
            if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
          return '';
        });
        assert.deepEqual(require('./board-lib.cjs').hash(copied), report.clipboardSha256, 'Copy button returned different data');
      }
      report.copyUiVerified = true;
      await page.screenshot({path: path.join(c.root, 'web-preview.png'), fullPage: true});
      fs.writeFileSync(path.join(c.root, 'capture-report.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
