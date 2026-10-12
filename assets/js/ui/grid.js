// ui/grid.js
// Renders the responsive component grid, manages card templates, and wires lazy observer.

import { mountPreview, unmountPreview } from "./preview-pool.js";
import { openCodeDialog } from "./code-dialog.js";

export class GridView {
  constructor(container, items, taxonomy) {
    this.container = container;
    this.items = items;
    this.taxonomy = taxonomy;
    this.cardMap = new Map(); // id -> element
    this.observer = null;

    this.themeColorMap = new Map();
    taxonomy.themes.forEach(t => this.themeColorMap.set(t.id, t.color));

    this.initObserver();
    this.renderInitial();
  }

  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target;
        const id = card.dataset.id;
        const item = this.items.find(i => i.id === id);
        if (!item) return;

        const previewContainer = card.querySelector("[data-preview]");
        if (entry.isIntersecting) {
          mountPreview(previewContainer, item);
        } else {
          // Unmount if scrolled far away
          unmountPreview(id);
        }
      });
    }, {
      rootMargin: "300px 0px 300px 0px",
      threshold: 0.01
    });
  }

  renderInitial() {
    const template = document.getElementById("card-template");
    const fragment = document.createDocumentFragment();

    this.items.forEach((item, index) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector(".card");
      card.dataset.id = item.id;

      // Defer rendering beyond the first fold
      if (index >= 6) {
        card.classList.add("is-deferred");
      }

      // Title & desc
      card.querySelector(".card-title").textContent = item.title;
      card.querySelector(".card-desc").textContent = item.description || "";

      // Theme dots
      const themesEl = card.querySelector(".card-themes");
      (item.themes || []).forEach(thId => {
        const dot = document.createElement("span");
        dot.className = "theme-dot";
        dot.style.setProperty("--chip-color", this.themeColorMap.get(thId) || "var(--accent)");
        dot.title = thId;
        themesEl.appendChild(dot);
      });

      // Tags
      const tagsEl = card.querySelector(".card-tags");
      (item.tags || []).slice(0, 4).forEach(tag => {
        const li = document.createElement("li");
        li.textContent = tag;
        tagsEl.appendChild(li);
      });

      // Button Get Code
      const codeBtn = card.querySelector("[data-action='code']");
      codeBtn.addEventListener("click", () => {
        openCodeDialog(item);
      });

      fragment.appendChild(clone);
    });

    this.container.appendChild(fragment);

    // Track card elements and observe
    this.container.querySelectorAll(".card").forEach((card) => {
      this.cardMap.set(card.dataset.id, card);
      this.observer.observe(card);
    });
  }

  updateVisibility(visibleIds) {
    let visibleCount = 0;
    this.cardMap.forEach((card, id) => {
      const isVisible = visibleIds.has(id);
      if (isVisible) {
        card.removeAttribute("hidden");
        visibleCount++;
      } else {
        card.setAttribute("hidden", "");
        unmountPreview(id);
      }
    });

    const emptyEl = document.getElementById("empty");
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }

    return visibleCount;
  }
}
