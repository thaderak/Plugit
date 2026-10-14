const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html does not exist. Run "npm run build" first.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Incrustar logo en base64
const imgPath = path.join(distDir, 'deskplugit.png');
if (fs.existsSync(imgPath)) {
  const b64 = fs.readFileSync(imgPath).toString('base64');
  const dataUri = `data:image/png;base64,${b64}`;
  html = html.replace(/src="\.\/deskplugit\.png"/g, `src="${dataUri}"`);
  html = html.replace(/href="\.\/deskplugit\.png"/g, `href="${dataUri}"`);
}

// 2. Incrustar CSS
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/);
if (cssMatch) {
  const cssFile = path.join(distDir, 'assets', cssMatch[1]);
  if (fs.existsSync(cssFile)) {
    const css = fs.readFileSync(cssFile, 'utf8');
    html = html.replace(cssMatch[0], `<style>\n${css}\n</style>`);
  }
}

// 3. Incrustar JS
const jsMatch = html.match(/<script type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/);
if (jsMatch) {
  const jsFile = path.join(distDir, 'assets', jsMatch[1]);
  if (fs.existsSync(jsFile)) {
    const js = fs.readFileSync(jsFile, 'utf8');
    html = html.replace(jsMatch[0], `<script type="module">\n${js}\n</script>`);
  }
}

const outPath = path.join(distDir, 'PlugiT.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Single-file PlugiT.html creado exitosamente:', outPath);
console.log('Tamaño:', (fs.statSync(outPath).size / 1024).toFixed(1), 'KB');
