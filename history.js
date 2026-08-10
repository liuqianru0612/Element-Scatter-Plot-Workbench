(function () {
  const key = "elementWorkbenchNew.history.v1";
  const maxEntries = 80;

  const HistoryStore = {
    all() {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

    save(items) {
      const requested = items.slice(0, maxEntries);
      const kept = [...requested];
      while (kept.length) {
        try {
          localStorage.setItem(key, JSON.stringify(kept));
          return { items: kept, removed: items.length - kept.length };
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          if (kept.length === 1) throw new Error("浏览器本地存储空间不足，当前图件无法保存");
          kept.pop();
        }
      }
      localStorage.removeItem(key);
      return { items: [], removed: items.length };
    },

    add(entry) {
      return this.save([entry, ...this.all()]);
    },

    remove(id) {
      return this.save(this.all().filter((item) => item.id !== id));
    },

    clear() {
      localStorage.removeItem(key);
      return [];
    }
  };

  function isQuotaError(error) {
    return error && (
      error.name === "QuotaExceededError"
      || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || error.code === 22
      || error.code === 1014
    );
  }

  window.HistoryStore = HistoryStore;
})();
