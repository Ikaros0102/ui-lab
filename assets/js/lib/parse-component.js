// lib/parse-component.js
// Parses full component HTML, strips metadata, and extracts separated HTML, CSS, and JS blocks.

const META_RE = /<script[^>]*\bdata-uilab-meta\b[^>]*>[\s\S]*?<\/script>\s*/i;

export function stripMeta(fullCode) {
  return fullCode.replace(META_RE, "");
}

function dedent(text) {
  const lines = text.split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return "";

  const minIndent = lines.reduce((min, line) => {
    if (!line.trim()) return min;
    const indent = line.match(/^[\t ]*/)[0].length;
    return Math.min(min, indent);
  }, Infinity);

  if (minIndent === Infinity || minIndent === 0) return lines.join("\n");
  return lines.map(line => line.slice(minIndent)).join("\n");
}

export function parseComponent(fullSource) {
  const cleanSource = stripMeta(fullSource);
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanSource, "text/html");

  // Extract CSS
  const styles = Array.from(doc.querySelectorAll("style"));
  const css = styles.map(s => s.textContent).join("\n\n").trim();

  // Extract JS (excluding json scripts if any left)
  const scripts = Array.from(doc.querySelectorAll("script")).filter(s => {
    const type = s.getAttribute("type");
    return !type || type === "text/javascript" || type === "module";
  });
  const js = scripts.map(s => s.textContent).join("\n\n").trim();

  // Extract body markup (remove scripts from body for clean HTML)
  scripts.forEach(s => s.remove());
  styles.forEach(s => s.remove());

  const html = dedent(doc.body ? doc.body.innerHTML : "");

  return {
    full: cleanSource.trim(),
    html: html.trim(),
    css: dedent(css),
    js: dedent(js)
  };
}
