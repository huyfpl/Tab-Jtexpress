// Load tabs configuration từ GitHub
const TAB_CONFIG_MANAGER = (() => {
  let cachedConfig = null;
  const CONFIG_URL = "https://huyfpl.github.io/Tab-Jtexpress/tabs-config.json";

  const loadConfig = async () => {
    if (cachedConfig) return cachedConfig;

    // 1️⃣ Thử fetch từ GitHub
    try {
      const response = await fetch(CONFIG_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      cachedConfig = data;
      return data;
    } catch (e) {
      console.warn('Failed to load tabs config from GitHub:', e);
    }

    // 2️⃣ Nếu GitHub không thành công, fetch từ file local
    try {
      const response = await fetch(chrome.runtime.getURL('tabs-config.json'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      cachedConfig = data;
      return data;
    } catch (e) {
      console.error('Failed to load tabs config from local file:', e);
      return { tabs: [] };
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
