const feishuService = require('../services/feishuService');
const { normalizeModule } = require('../config/modules');

const escapeFilterValue = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const queryInventory = async (req, res) => {
  try {
    const itemNo = String(req.query.item_no || '').trim();
    if (!itemNo) {
      return res.status(400).json({ success: false, error: '缺少货号 item_no' });
    }

    const module = normalizeModule('inventory');
    const target = feishuService._getBitableTarget(module);

    const filter = `CurrentValue.[货号]="${escapeFilterValue(itemNo)}"`;
    let pageToken = undefined;
    const all = [];

    for (let i = 0; i < 20; i++) {
      const resp = await feishuService.client.bitable.appTableRecord.list({
        path: {
          app_token: target.appToken,
          table_id: target.tableId,
        },
        params: {
          filter,
          page_size: 200,
          page_token: pageToken,
        },
      });

      if (resp.code !== 0) {
        return res.status(500).json({ success: false, error: `飞书查询失败: ${resp.msg}` });
      }

      const items = resp.data?.items || [];
      all.push(...items);
      if (!resp.data?.has_more) break;
      pageToken = resp.data?.page_token;
      if (!pageToken) break;
    }

    const qtyBySize = new Map();
    for (const r of all) {
      const fields = r.fields || {};
      const size = fields['尺码'];
      const qty = Number(fields['数量'] || 0);
      const key = String(size);
      qtyBySize.set(key, (qtyBySize.get(key) || 0) + qty);
    }

    const rows = Array.from(qtyBySize.entries())
      .map(([size, quantity]) => ({ size: Number.isFinite(Number(size)) ? Number(size) : size, quantity }))
      .sort((a, b) => {
        const na = Number(a.size);
        const nb = Number(b.size);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size));
      });

    res.json({ success: true, item_no: itemNo, rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

module.exports = {
  queryInventory,
};

