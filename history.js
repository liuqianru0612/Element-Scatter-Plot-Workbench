(function () {
  const key = "elementWorkbenchNew.history.v1";
  const HistoryStore = {
    all() {
      try { return JSON.parse(localStorage.getItem(key) || "[]"); }
      catch { return []; }
    },
    save(items) {
      localStorage.setItem(key, JSON.stringify(items.slice(0, 80)));
    },
    add(entry) {
      const items = this.all();
      items.unshift(entry);
      this.save(items);
      return items;
    },
    remove(id) {
      const items = this.all().filter((item) => item.id !== id);
      this.save(items);
      return items;
    },
    clear() {
      localStorage.removeItem(key);
      return [];
    }
  };
  window.HistoryStore = HistoryStore;
})();
