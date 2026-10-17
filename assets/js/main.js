// main.js
// Main entry point for UI Lab.

import { loadManifest, loadTaxonomy } from "./core/registry.js";
import { Store } from "./core/store.js";
import { SearchEngine } from "./core/search.js";
import { renderFilters } from "./ui/filters.js";
import { GridView } from "./ui/grid.js";
import { initCodeDialog } from "./ui/code-dialog.js";
import { setupResizeHandler, notifyScrollState } from "./ui/preview-pool.js";

function setupScrollGuard() {
  let scrollTimeout = null;
  let isScrolling = false;

  window.addEventListener("scroll", () => {
    if (!isScrolling) {
      isScrolling = true;
      document.body.classList.add("is-scrolling");
      notifyScrollState(true);
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      document.body.classList.remove("is-scrolling");
      notifyScrollState(false);
    }, 140);
  }, { passive: true });
}

async function init() {
  try {
    const [manifest, taxonomy] = await Promise.all([
      loadManifest(),
      loadTaxonomy()
    ]);

    const items = manifest.items || [];
    const store = new Store();
    const searchEngine = new SearchEngine(items);

    const gridContainer = document.getElementById("grid");
    const gridView = new GridView(gridContainer, items, taxonomy);

    renderFilters(taxonomy, items, store);
    initCodeDialog();
    setupResizeHandler();
    setupScrollGuard();

    // Topbar search input
    const searchInput = document.getElementById("search");
    const resultCountEl = document.getElementById("result-count");
    const resetBtn = document.getElementById("reset-filters");

    // Hotkey '/' to focus search
    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.blur();
      }
    });

    searchInput.value = store.getState().search;
    let searchDebounceTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        store.setSearch(searchInput.value);
      }, 60);
    });

    resetBtn.addEventListener("click", () => {
      store.reset();
      searchInput.value = "";
    });

    // Store update pipeline
    store.subscribe((state) => {
      const visibleIds = searchEngine.filter(state);
      const count = gridView.updateVisibility(visibleIds);

      resultCountEl.textContent = `${count} of ${items.length}`;
      resetBtn.hidden = !store.isFiltered();
      if (searchInput.value !== state.search) {
        searchInput.value = state.search;
      }
    });

  } catch (err) {
    console.error("Initialization error:", err);
    const grid = document.getElementById("grid");
    if (grid) {
      grid.innerHTML = `<div class="empty"><p class="empty-title">Failed to load components</p><p>${err.message}</p></div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
