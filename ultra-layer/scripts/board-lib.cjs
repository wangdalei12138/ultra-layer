const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function dep(name) {
  try { return require(name); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !process.env.BOARD_NODE_MODULES) throw error;
    return require(path.join(process.env.BOARD_NODE_MODULES, name));
  }
}
function inside(root, relative) {
  const file = path.resolve(root, relative);
  assert(file.startsWith(root + path.sep), 'Path must be inside project: ' + relative);
  const real = fs.realpathSync(file);
  assert(real.startsWith(root + path.sep), 'Symlink escapes project: ' + relative);
  return file;
}
function config(file) {
  const absolute = fs.realpathSync(file);
  const root = path.dirname(absolute);
  const value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  assert(value.width > 0 && value.height > 0 && value.selector && value.page, 'width/height/page/selector required');
  assert(Array.isArray(value.sourceFiles) && value.sourceFiles.includes(value.page), 'sourceFiles must include page');
  inside(root, value.page);
  return { ...value, root, configPath: absolute };
}
function hash(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function fingerprints(c) {
  const entries = {};
  function walk(relative) {
    const file = inside(c.root, relative);
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) if (!name.startsWith('._')) walk(path.join(relative, name));
    } else entries[relative] = hash(fs.readFileSync(file));
  }
  for (const relative of [...new Set([path.basename(c.configPath), ...c.sourceFiles])].sort()) walk(relative);
  return entries;
}
function decode(html) {
  const match = html.match(/\(figh2d\)([A-Za-z0-9+/=]+)\(\/figh2d\)/);
  assert(match, 'Clipboard does not contain Figma H2D data');
  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
}
async function validate(html, c) {
  const data = decode(html);
  assert(data.root?.rect, 'Missing root rectangle');
  assert(Math.abs(data.root.rect.width - c.width) < 0.1, 'Captured width differs');
  assert(Math.abs(data.root.rect.height - c.height) < 0.1, 'Captured height differs');
  const texts = [], images = [], families = new Set();
  function walk(n) {
    if (n.nodeType === 3 && n.text?.trim()) texts.push(n.text);
    if (n.tag === 'IMG') images.push(n);
    if (n.styles?.fontFamily) families.add(n.styles.fontFamily);
    for (const child of n.childNodes || []) walk(child);
  }
  walk(data.root);
  assert(texts.length > 0, 'No native text nodes captured');
  const normalize = s => s.replace(/\s+/gu, '');
  const allText = normalize(texts.join(''));
  for (const text of c.requiredTexts || []) assert(allText.includes(normalize(text)), 'Missing required text: ' + text);
  if (c.expectedImageCount !== undefined) assert.equal(images.length, c.expectedImageCount, 'Image count differs');
  if (c.fontFamily) {
    assert(families.size > 0, 'No font family captured');
    for (const family of families) {
      const firstFamily = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      assert.equal(firstFamily, c.fontFamily, 'Unexpected font: ' + family);
    }
  }
  const assets = Object.values(data.assets || {});
  for (const image of images) {
    const url = image.attributes?.currentSrc || image.attributes?.src;
    assert(url && assets.some(a => a.url === url && a.blob?.base64Blob), 'Image asset not embedded: ' + url);
  }
  const transparency = [];
  for (const relative of c.transparentAssets || []) {
    inside(c.root, relative);
    const asset = assets.find(a => {
      try { return decodeURIComponent(new URL(a.url).pathname).endsWith('/' + relative.replaceAll(path.sep, '/')); }
      catch { return false; }
    });
    assert(asset?.blob?.base64Blob, 'Missing transparent asset: ' + relative);
    const b64 = asset.blob.base64Blob;
    const buffer = Buffer.from(b64.includes(',') ? b64.split(',')[1] : b64, 'base64');
    const sharp = dep('sharp');
    const metadata = await sharp(buffer).metadata();
    assert(metadata.format === 'png' && metadata.hasAlpha, 'Not RGBA PNG: ' + relative);
    const stats = await sharp(buffer).stats();
    const alpha = stats.channels.at(-1);
    assert(alpha.min === 0 && alpha.max > 200, 'Alpha must include clear background and visible subject: ' + relative);
    transparency.push({ file: relative, width: metadata.width, height: metadata.height, alphaMin: alpha.min, alphaMax: alpha.max });
  }
  return { width: data.root.rect.width, height: data.root.rect.height, textNodes: texts.length,
    imageNodes: images.length, embeddedAssets: assets.length, fontFamilies: [...families], transparency,
    clipboardSha256: hash(html) };
}
module.exports = { fs, path, assert, dep, config, fingerprints, hash, validate };
