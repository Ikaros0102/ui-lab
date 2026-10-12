// core/store.js
// Reactive state store synced with URLSearchParams.

export class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.readFromUrl();

    window.addEventListener("popstate", () => {
      this.state = this.readFromUrl();
      this.notify();
    });
  }

  readFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const themes = params.get("theme") ? params.get("theme").split(",").filter(Boolean) : [];
    const techniques = params.get("tech") ? params.get("tech").split(",").filter(Boolean) : [];

    return {
      category: params.get("cat") || "all",
      search: params.get("q") || "",
      themes: new Set(themes),
      techniques: new Set(techniques)
    };
  }

  syncToUrl() {
    const params = new URLSearchParams();
    if (this.state.category && this.state.category !== "all") {
      params.set("cat", this.state.category);
    }
    if (this.state.search.trim()) {
      params.set("q", this.state.search.trim());
    }
    if (this.state.themes.size > 0) {
      params.set("theme", Array.from(this.state.themes).join(","));
    }
    if (this.state.techniques.size > 0) {
      params.set("tech", Array.from(this.state.techniques).join(","));
    }

    const query = params.toString();
    const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }

  getState() {
    return this.state;
  }

  setCategory(category) {
    if (this.state.category !== category) {
      this.state.category = category;
      this.syncToUrl();
      this.notify();
    }
  }

  setSearch(query) {
    if (this.state.search !== query) {
      this.state.search = query;
      this.syncToUrl();
      this.notify();
    }
  }

  toggleTheme(themeId) {
    if (this.state.themes.has(themeId)) {
      this.state.themes.delete(themeId);
    } else {
      this.state.themes.add(themeId);
    }
    this.syncToUrl();
    this.notify();
  }

  toggleTechnique(technique) {
    if (this.state.techniques.has(technique)) {
      this.state.techniques.delete(technique);
    } else {
      this.state.techniques.add(technique);
    }
    this.syncToUrl();
    this.notify();
  }

  reset() {
    this.state = {
      category: "all",
      search: "",
      themes: new Set(),
      techniques: new Set()
    };
    this.syncToUrl();
    this.notify();
  }

  isFiltered() {
    return (
      this.state.category !== "all" ||
      this.state.search.trim() !== "" ||
      this.state.themes.size > 0 ||
      this.state.techniques.size > 0
    );
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
