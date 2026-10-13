const button = document.querySelector('#copy-board');
const output = document.querySelector('#copy-status');
let payload;
function message(text, error = false) { output.textContent = text; output.dataset.error = String(error); }
async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取 ' + url);
  return response.text();
}
async function load() {
  button.disabled = true;
  try {
    const config = JSON.parse(await fetchText('board-config.json'));
    document.title = config.title + ' · 可编辑画板';
    document.querySelector('#board-title').textContent = config.title;
    document.querySelector('#dimensions').textContent = `${config.width} × ${config.height}` + (config.fontFamily ? ` · ${config.fontFamily}` : '');
    const iframe = document.querySelector('#board');
    iframe.src = config.page;
    iframe.style.width = config.width + 'px'; iframe.style.height = config.height + 'px';
    const wrap = document.querySelector('.frame-wrap');
    const surface = document.querySelector('.surface');
    function fit() {
      const style = getComputedStyle(surface);
      const available = surface.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const scale = Math.min(1, available / config.width);
      wrap.style.width = config.width * scale + 'px'; wrap.style.height = config.height * scale + 'px';
      iframe.style.transform = `scale(${scale})`;
    }
    if (window.boardResizeObserver) window.boardResizeObserver.disconnect();
    window.boardResizeObserver = new ResizeObserver(fit); window.boardResizeObserver.observe(surface); fit();
    const html = await fetchText('figma-clipboard.html');
    if (!html.includes('(figh2d)')) throw new Error('画板复制数据无效，请重新生成');
    payload = html;
    message('已准备好，点击按钮复制。');
  } catch (error) { message(error.message + '。点击按钮重试。', true); }
  finally { button.disabled = false; }
}
button.addEventListener('click', async () => {
  if (!payload) { await load(); return; }
  if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) {
    message('请通过 localhost 地址，用支持剪贴板的 Chrome / Edge 打开。', true); return;
  }
  button.disabled = true;
  try {
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([payload], {type: 'text/html'})})]);
    message('已复制 ✓ 到 Figma 画布按 ⌘V / Ctrl+V。');
  } catch { message('浏览器未允许复制。请检查剪贴板权限，再点击重试。', true); }
  finally { button.disabled = false; }
});
load();
