const getRequiredEnv = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

const getOptionalEnv = (key, fallback = '') => process.env[key] || fallback;

const MODULES = {
  purchase: {
    key: 'purchase',
    label: '采购',
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_PURCHASE_TABLE_ID', getOptionalEnv('FEISHU_BITABLE_TABLE_ID')),
    },
    writeMode: 'upsert_accumulate',
    fields: {
      hasSupplier: true,
      hasSalesManual: false,
      includeSkuCode: true,
    },
  },
  inventory: {
    key: 'inventory',
    label: '库存',
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_INVENTORY_TABLE_ID', getOptionalEnv('FEISHU_BITABLE_TABLE_ID')),
    },
    writeMode: 'upsert_accumulate',
    fields: {
      hasSupplier: false,
      hasSalesManual: false,
      includeSkuCode: true,
    },
  },
  sales: {
    key: 'sales',
    label: '销售',
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_SALES_TABLE_ID'),
    },
    writeMode: 'create_detail',
    fields: {
      hasSupplier: false,
      hasSalesManual: true,
      includeSkuCode: false,
    },
  },
};

const normalizeModule = (moduleKey) => {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key) return 'purchase';
  if (!MODULES[key]) {
    const supported = Object.keys(MODULES).join(', ');
    throw new Error(`Invalid module: ${key}. Supported: ${supported}`);
  }
  return key;
};

const getModuleConfig = (moduleKey) => {
  const key = normalizeModule(moduleKey);
  const cfg = MODULES[key];
  const appToken = cfg.bitable.appToken;
  const tableId = cfg.bitable.tableId;
  if (!appToken) getRequiredEnv('FEISHU_BITABLE_APP_TOKEN');
  if (key === 'sales' && !process.env.FEISHU_BITABLE_SALES_TABLE_ID) {
    getRequiredEnv('FEISHU_BITABLE_SALES_TABLE_ID');
  }
  if (!tableId) {
    if (key === 'purchase') getRequiredEnv('FEISHU_BITABLE_PURCHASE_TABLE_ID');
    if (key === 'inventory') getRequiredEnv('FEISHU_BITABLE_INVENTORY_TABLE_ID');
  }
  return cfg;
};

module.exports = {
  MODULES,
  normalizeModule,
  getModuleConfig,
};
