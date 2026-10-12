// ui/code-dialog.js
// Get Code modal dialog: tab switching, code syntax highlighting, copying, and full preview.

import { getComponentCode } from "../core/registry.js";
import { parseComponent } from "../lib/parse-component.js";
import { highlight } from "../lib/highlight.js";
import { showToast } from "./toast.js";
import { buildSrcdoc } from "./preview-pool.js";

const dialog = document.getElementById("code-dialog");
const cdCategory = document.getElementById("cd-category");
const cdTitle = document.getElementById("cd-title");
const cdDesc = document.getElementById("cd-desc");
const cdOpen = document.getElementById("cd-open");
const cdRecipeText = document.getElementById("cd-recipe-text");
const cdTechniques = document.getElementById("cd-techniques");
const cdRecipe = document.getElementById("cd-recipe");
const cdTabs = document.getElementById("cd-tabs");
const cdPreview = document.getElementById("cd-preview");
const cdCode = document.getElementById("cd-code");
const cdCodeEl = cdCode.querySelector("code");
const cdCopy = document.getElementById("cd-copy");

let currentItem = null;
let currentParsed = null;
let activeTab = "html";

export function initCodeDialog() {
  if (!dialog) return;

  // Close button click
  dialog.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeDialog());
  });

  // Light dismiss fallback
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inside) closeDialog();
    });
  }

  // Tab switching
  cdTabs.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-tab]");
    if (!tabBtn) return;
    switchTab(tabBtn.dataset.tab);
  });

  // Copy code
  cdCopy.addEventListener("click", async () => {
    if (!currentParsed) return;
    let textToCopy = "";
    if (activeTab === "html") textToCopy = currentParsed.html;
    else if (activeTab === "css") textToCopy = currentParsed.css;
    else if (activeTab === "js") textToCopy = currentParsed.js;
    else if (activeTab === "full") textToCopy = currentParsed.full;

    if (!textToCopy) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      showToast("Copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy", err);
    }
  });
}

function switchTab(tab) {
  activeTab = tab;
  cdTabs.querySelectorAll("[role='tab']").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });

  if (tab === "preview") {
    cdCode.hidden = true;
    cdPreview.hidden = false;
    cdCopy.hidden = true;
    renderDialogPreview();
  } else {
    cdPreview.hidden = true;
    cdCode.hidden = false;
    cdCopy.hidden = false;
    renderCode(tab);
  }
}

function renderCode(tab) {
  if (!currentParsed) return;
  const raw = currentParsed[tab] || "";
  cdCodeEl.innerHTML = highlight(raw, tab);
}

function renderDialogPreview() {
  if (!currentItem || !currentParsed) return;
  cdPreview.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.style.minWidth = "100%";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.srcdoc = buildSrcdoc(currentParsed.full, currentItem.preview?.mode);
  cdPreview.appendChild(iframe);
}

export async function openCodeDialog(item) {
  currentItem = item;

  cdCategory.textContent = item.category.toUpperCase();
  cdTitle.textContent = item.title;
  cdDesc.textContent = item.description || "";
  cdOpen.href = item.path;

  if (item.recipe) {
    cdRecipe.hidden = false;
    cdRecipeText.textContent = item.recipe;
  } else {
    cdRecipe.hidden = true;
  }

  cdTechniques.innerHTML = "";
  (item.techniques || []).forEach((tech) => {
    const li = document.createElement("li");
    li.textContent = tech;
    cdTechniques.appendChild(li);
  });

  const rawCode = await getComponentCode(item.path);
  currentParsed = parseComponent(rawCode);

  // Tab visibility
  const jsTab = cdTabs.querySelector("[data-tab='js']");
  if (jsTab) {
    jsTab.hidden = !currentParsed.js;
  }

  // Default to HTML tab or preview
  switchTab("html");

  dialog.showModal();
}

export function closeDialog() {
  dialog.close();
  cdPreview.innerHTML = "";
}
