// lib/highlight.js
// Lightweight, safe syntax highlighter for HTML, CSS, and JavaScript.
// Produces escaped HTML with token classes without innerHTML vulnerability.

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function highlight(code, lang) {
  if (!code) return "";
  const escaped = escapeHtml(code);

  if (lang === "html" || lang === "full") {
    return highlightHtml(escaped);
  }
  if (lang === "css") {
    return highlightCss(escaped);
  }
  if (lang === "js") {
    return highlightJs(escaped);
  }
  return escaped;
}

function highlightHtml(src) {
  // Comments: &lt;!-- ... --&gt;
  // Tags: &lt;tag or &lt;/tag&gt;
  // Attributes: attr=&quot;...&quot;
  return src
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
    .replace(/(&lt;\/?[a-zA-Z0-9\-]+)(\s|&gt;|\/)/g, '<span class="tok-tag">$1</span>$2')
    .replace(/([a-zA-Z\-:@]+)=(&quot;.*?&quot;|&#039;.*?&#039;)/g, '<span class="tok-attr">$1</span>=<span class="tok-string">$2</span>');
}

function highlightCss(src) {
  return src
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
    .replace(/(@[a-zA-Z\-]+)/g, '<span class="tok-at">$1</span>')
    .replace(/([a-zA-Z\-]+)\s*:/g, '<span class="tok-prop">$1</span>:')
    .replace(/(url\(.*?\)|&quot;.*?&quot;|&#039;.*?&#039;)/g, '<span class="tok-string">$1</span>')
    .replace(/(:root|[.#][a-zA-Z0-9_\-]+|::?[a-zA-Z0-9_\-]+)/g, '<span class="tok-selector">$1</span>');
}

function highlightJs(src) {
  const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|new|async|await|try|catch|finally|throw|this|typeof|instanceof)\b/g;
  return src
    .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>')
    .replace(/(&quot;.*?&quot;|&#039;.*?&#039;|`[\s\S]*?`)/g, '<span class="tok-string">$1</span>')
    .replace(keywords, '<span class="tok-keyword">$1</span>')
    .replace(/\b([a-zA-Z0-9_$]+)\s*(?=\()/g, '<span class="tok-func">$1</span>')
    .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}
