// ui/filters.js
// Renders sidebar categories, themes, and techniques pills, and handles interactions.

export function renderFilters(taxonomy, items, store) {
  const catContainer = document.getElementById("category-filters");
  const themeContainer = document.getElementById("theme-filters");
  const techContainer = document.getElementById("technique-filters");

  // Calculate item counts per category
  const catCounts = { all: items.length };
  taxonomy.categories.forEach((c) => { catCounts[c.id] = 0; });
  items.forEach((item) => {
    if (catCounts[item.category] !== undefined) {
      catCounts[item.category]++;
    }
  });

  // Render Category List
  catContainer.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "filter-item";
  allBtn.setAttribute("role", "radio");
  allBtn.dataset.category = "all";
  allBtn.innerHTML = `<span>All Components</span><span class="filter-count">${catCounts.all}</span>`;
  catContainer.appendChild(allBtn);

  taxonomy.categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-item";
    btn.setAttribute("role", "radio");
    btn.dataset.category = cat.id;
    btn.dataset.count = catCounts[cat.id];
    btn.innerHTML = `<span>${cat.label}</span><span class="filter-count">${catCounts[cat.id]}</span>`;
    catContainer.appendChild(btn);
  });

  catContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    store.setCategory(btn.dataset.category);
  });

  // Render Theme Chips
  themeContainer.innerHTML = "";
  taxonomy.themes.forEach((th) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.theme = th.id;
    chip.style.setProperty("--chip-color", th.color || "var(--accent)");
    chip.innerHTML = `<span class="chip-dot"></span><span>${th.label}</span>`;
    themeContainer.appendChild(chip);
  });

  themeContainer.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-theme]");
    if (!chip) return;
    store.toggleTheme(chip.dataset.theme);
  });

  // Collect distinct techniques
  const techSet = new Set();
  items.forEach((it) => {
    (it.techniques || []).forEach((t) => techSet.add(t));
  });

  techContainer.innerHTML = "";
  Array.from(techSet).sort().forEach((tech) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.tech = tech;
    chip.textContent = tech;
    techContainer.appendChild(chip);
  });

  techContainer.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tech]");
    if (!chip) return;
    store.toggleTechnique(chip.dataset.tech);
  });

  // Subscribe to store updates to update UI active states
  store.subscribe((state) => {
    // Categories
    catContainer.querySelectorAll(".filter-item").forEach((btn) => {
      const isChecked = btn.dataset.category === state.category;
      btn.setAttribute("aria-checked", isChecked ? "true" : "false");
    });

    // Themes
    themeContainer.querySelectorAll(".chip").forEach((chip) => {
      const isPressed = state.themes.has(chip.dataset.theme);
      chip.setAttribute("aria-pressed", isPressed ? "true" : "false");
    });

    // Techniques
    techContainer.querySelectorAll(".chip").forEach((chip) => {
      const isPressed = state.techniques.has(chip.dataset.tech);
      chip.setAttribute("aria-pressed", isPressed ? "true" : "false");
    });
  });
}
