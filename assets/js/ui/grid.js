// ui/grid.js
// Renders the responsive component grid with static WebP posters and "Hover-to-Play" live iframe controller.

import { mountPreview, unmountPreview } from "./preview-pool.js";
import { openCodeDialog } from "./code-dialog.js";

const HOVER_MOUNT_DELAY_MS = 190; // 180–200ms debounce before mounting live iframe
const HOVER_UNMOUNT_DELAY_MS = 600; // 500–800ms smooth grace period before unmounting on leave

export class GridView {
  constructor(container, items, taxonomy) {
    this.container = container;
    this.items = items;
    this.taxonomy = taxonomy;
    this.cardMap = new Map(); // id -> element
    this.itemMap = new Map(); // id -> item metadata (O(1) lookup)
    this.enterTimers = new Map(); // id -> timeoutId
    this.leaveTimers = new Map(); // id -> timeoutId

    items.forEach((item) => this.itemMap.set(item.id, item));

    this.themeColorMap = new Map();
    taxonomy.themes.forEach((t) => this.themeColorMap.set(t.id, t.color));

    this.renderInitial();
  }

  clearHoverTimers(id) {
    const enterTimer = this.enterTimers.get(id);
    if (enterTimer) {
      clearTimeout(enterTimer);
      this.enterTimers.delete(id);
    }
    const leaveTimer = this.leaveTimers.get(id);
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      this.leaveTimers.delete(id);
    }
  }

  wireHoverToPlay(card, previewContainer, item) {
    const id = item.id;

    const handleEnter = () => {
      // Cancel any pending unmount if user briefly left and re-entered
      const leaveTimer = this.leaveTimers.get(id);
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        this.leaveTimers.delete(id);
      }

      if (this.enterTimers.has(id)) return;

      const timer = setTimeout(() => {
        this.enterTimers.delete(id);
        mountPreview(previewContainer, item);
      }, HOVER_MOUNT_DELAY_MS);

      this.enterTimers.set(id, timer);
    };

    const handleLeave = () => {
      const enterTimer = this.enterTimers.get(id);
      if (enterTimer) {
        clearTimeout(enterTimer);
        this.enterTimers.delete(id);
      }

      const existingLeave = this.leaveTimers.get(id);
      if (existingLeave) clearTimeout(existingLeave);

      const timer = setTimeout(() => {
        this.leaveTimers.delete(id);
        unmountPreview(id);
      }, HOVER_UNMOUNT_DELAY_MS);

      this.leaveTimers.set(id, timer);
    };

    card.addEventListener("pointerenter", handleEnter, { passive: true });
    card.addEventListener("pointerleave", handleLeave, { passive: true });
  }

  renderInitial() {
    const template = document.getElementById("card-template");
    const fragment = document.createDocumentFragment();

    this.items.forEach((item, index) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector(".card");
      card.dataset.id = item.id;

      // Defer offscreen cards beyond the initial viewport fold
      if (index >= 6) {
        card.classList.add("is-deferred");
      }

      // Setup static WebP poster & graceful fallback
      const previewContainer = card.querySelector("[data-preview]");
      const poster = card.querySelector(".preview-poster");

      if (poster) {
        poster.alt = `${item.title} preview`;

        // LCP & above-the-fold priority optimization
        if (index === 0) {
          poster.removeAttribute("loading");
          poster.setAttribute("fetchpriority", "high");
        } else if (index < 6) {
          poster.removeAttribute("loading");
        }

        poster.addEventListener(
          "load",
          () => {
            poster.classList.add("is-loaded");
          },
          { once: true }
        );

        poster.addEventListener(
          "error",
          () => {
            poster.classList.add("is-missing");
            previewContainer.classList.add("has-poster-fallback");
            previewContainer.dataset.fallbackLabel = `${item.category} · Hover to play`;
          },
          { once: true }
        );

        poster.src = `assets/thumbnails/${item.id}.webp`;
      }

      // Wire Hover-to-Play interactive iframe mounting
      this.wireHoverToPlay(card, previewContainer, item);

      // Title & desc
      card.querySelector(".card-title").textContent = item.title;
      card.querySelector(".card-desc").textContent = item.description || "";

      // Theme dots
      const themesEl = card.querySelector(".card-themes");
      (item.themes || []).forEach((thId) => {
        const dot = document.createElement("span");
        dot.className = "theme-dot";
        dot.style.setProperty(
          "--chip-color",
          this.themeColorMap.get(thId) || "var(--accent)"
        );
        dot.title = thId;
        themesEl.appendChild(dot);
      });

      // Tags
      const tagsEl = card.querySelector(".card-tags");
      (item.tags || []).slice(0, 4).forEach((tag) => {
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

    // Track card elements
    this.container.querySelectorAll(".card").forEach((card) => {
      this.cardMap.set(card.dataset.id, card);
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
        this.clearHoverTimers(id);
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
