// core/search.js
// High-performance search and filtering engine.
// Precomputes searchable haystacks for instant token-based search.

export class SearchEngine {
  constructor(items) {
    this.items = items;
    this.index = new Map();

    for (const item of items) {
      const parts = [
        item.title,
        item.category,
        ...(item.themes || []),
        ...(item.tags || []),
        ...(item.techniques || []),
        item.description || "",
        item.recipe || ""
      ];
      this.index.set(item.id, parts.join(" ").toLowerCase());
    }
  }

  filter(state) {
    const searchTokens = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hasCategory = state.category && state.category !== "all";
    const selectedThemes = state.themes;
    const selectedTechniques = state.techniques;

    const matchedIds = new Set();

    for (const item of this.items) {
      if (hasCategory && item.category !== state.category) {
        continue;
      }

      if (selectedThemes.size > 0) {
        const itemThemes = item.themes || [];
        const matchesAnyTheme = itemThemes.some((t) => selectedThemes.has(t));
        if (!matchesAnyTheme) continue;
      }

      if (selectedTechniques.size > 0) {
        const itemTechniques = item.techniques || [];
        const matchesAnyTech = itemTechniques.some((tech) => selectedTechniques.has(tech));
        if (!matchesAnyTech) continue;
      }

      if (searchTokens.length > 0) {
        const haystack = this.index.get(item.id);
        const matchesAllTokens = searchTokens.every((token) => haystack.includes(token));
        if (!matchesAllTokens) continue;
      }

      matchedIds.add(item.id);
    }

    return matchedIds;
  }
}
