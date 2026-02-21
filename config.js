// Load tabs configuration từ tabs-config.json
const TAB_CONFIG_MANAGER = (() => {
  let cachedConfig = null;

  const loadConfig = async () => {
    if (cachedConfig) return cachedConfig;

    try {
      const response = await fetch(chrome.runtime.getURL('tabs-config.json'));
      const data = await response.json();
      cachedConfig = data;
      return data;
    } catch (e) {
      console.error('Failed to load tabs config:', e);
      // Fallback config nếu không load được
      return {
        tabs: [
          { id: "tab-Centerforplay", name: "In lại đơn", selector: "#tab-Centerforplay" },
          { id: "tab-sendWaybillSite", name: "Quản lý vận đơn gửi", selector: "#tab-sendWaybillSite" }
        ]
      };
    }
  };

  return {
    getConfig: loadConfig,
    getTAB_CONFIGS: async () => {
      const config = await loadConfig();
      return config.tabs.map(t => ({ id: t.id, name: t.name }));
    },
    getAllowedSelectors: async () => {
      const config = await loadConfig();
      return config.tabs.map(t => t.selector);
    }
  };
})();
