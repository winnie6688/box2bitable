Page({
  data: {
    results: [],
    purchaseGroups: [],
    syncing: false,
    hasFailures: false,
    failures: [],
    syncSummary: null,
    module: 'purchase',
    moduleLabel: '采购',
    payOptions: ['支付宝', '微信', '现金', '工商银行'],
    categoryOptions: ['男单', '女单', '男凉', '女凉']
  },

  onLoad(options) {
    const app = getApp();
    const moduleKey = (options && options.module) ? String(options.module) : (app.globalData.lastModule || 'purchase');
    const labelMap = { purchase: '采购', sales: '销售', inventory: '库存' };
    this.setData({
      module: moduleKey,
      moduleLabel: labelMap[moduleKey] || moduleKey
    });

    if (app.globalData.lastResults) {
      this.setData({
        results: app.globalData.lastResults,
        taskId: app.globalData.lastTaskId,
        dbTaskId: app.globalData.lastDbTaskId
      });
      this._recomputeView();
      // 使用完后清空
      app.globalData.lastResults = null;
      app.globalData.lastTaskId = null;
      app.globalData.lastDbTaskId = null;
      app.globalData.lastModule = null;
    } else if (options.results) {
      this.setData({
        results: JSON.parse(decodeURIComponent(options.results))
      });
      this._recomputeView();
    }
  },

  _ensureClientRowId(item, index) {
    if (item && item.client_row_id) return item.client_row_id;
    const base = Date.now();
    return `r_${base}_${index}_${Math.floor(Math.random() * 1e6)}`;
  },

  _generateSkuCode(itemNo, color, size) {
    const cleanNo = String(itemNo || '未知').trim().toUpperCase();
    const cleanColor = String(color || '默认').trim();
    const cleanSize = String(size || '均码').trim().toUpperCase();
    return `${cleanNo}-${cleanColor}-${cleanSize}`;
  },

  _normalizeResults(results, moduleKey) {
    const module = moduleKey || this.data.module;
    return (results || []).map((item, index) => {
      const next = Object.assign({}, item, {
        client_row_id: this._ensureClientRowId(item, index)
      });
      if (module !== 'sales') {
        next.sku_code = this._generateSkuCode(next.item_no, next.color, next.size);
      }
      if (module === 'sales') {
        if (next.quantity == null || next.quantity === '') next.quantity = 1;
        if (next.amount == null) next.amount = '';
        if (!next.pay_method) next.pay_method = '';
        if (next.remark == null) next.remark = '';
      }
      if (module === 'purchase' || module === 'inventory') {
        if (next.quantity == null || next.quantity === '') next.quantity = 1;
      }
      return next;
    });
  },

  _buildPurchaseGroups(results) {
    const groupsByKey = {};
    const order = [];
    (results || []).forEach((it, idx) => {
      const key = String(it.item_no || '').trim() || '未知货号';
      if (!groupsByKey[key]) {
        groupsByKey[key] = {
          groupKey: key,
          item_no: key,
          supplier: it.supplier || '',
          color: it.color || '',
          category: it.category || '',
          items: []
        };
        order.push(key);
      } else {
        if (!groupsByKey[key].supplier && it.supplier) groupsByKey[key].supplier = it.supplier;
        if (!groupsByKey[key].color && it.color) groupsByKey[key].color = it.color;
        if (!groupsByKey[key].category && it.category) groupsByKey[key].category = it.category;
      }
      groupsByKey[key].items.push({
        _idx: idx,
        size: it.size,
        quantity: it.quantity,
        sku_code: it.sku_code,
        sync_status: it.sync_status,
        sync_error: it.sync_error
      });
    });
    return order.map((k) => groupsByKey[k]);
  },

  _recomputeView() {
    const moduleKey = this.data.module;
    const normalized = this._normalizeResults(this.data.results || [], moduleKey);
    const patch = { results: normalized };
    if (moduleKey === 'purchase') {
      patch.purchaseGroups = this._buildPurchaseGroups(normalized);
    } else {
      patch.purchaseGroups = [];
    }
    this.setData(patch);
  },

  _applySyncStatuses(syncResults) {
    const statusBySku = {};
    const statusByRow = {};
    (syncResults || []).forEach(r => {
      const syncItem = (r && r.item) ? r.item : {};
      const rowId = syncItem.client_row_id;
      if (rowId) {
        statusByRow[rowId] = { status: r.status, error: r.error || '' };
      } else {
        const sku = this._generateSkuCode(syncItem.item_no, syncItem.color, syncItem.size);
        statusBySku[sku] = { status: r.status, error: r.error || '' };
      }
    });

    const results = (this.data.results || []).map(item => {
      const sku = this._generateSkuCode(item.item_no, item.color, item.size);
      const matched = item.client_row_id ? statusByRow[item.client_row_id] : statusBySku[sku];
      return Object.assign({}, item, {
        sku_code: item.sku_code || sku,
        sync_status: matched ? matched.status : '',
        sync_error: matched ? matched.error : ''
      });
    });

    this.setData({ results });
  },

  onInputChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const results = this.data.results;
    results[index][field] = value;
    results[index].sync_status = '';
    results[index].sync_error = '';
    this.setData({ results });
    this._recomputeView();
  },

  onPayMethodChange(e) {
    const { index } = e.currentTarget.dataset;
    const value = this.data.payOptions[e.detail.value];
    const results = this.data.results;
    results[index].pay_method = value;
    results[index].sync_status = '';
    results[index].sync_error = '';
    this.setData({ results });
    this._recomputeView();
  },

  onPurchaseGroupInputChange(e) {
    const { groupindex, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const groups = this.data.purchaseGroups || [];
    const group = groups[groupindex];
    if (!group) return;

    const results = this.data.results;
    const indices = (group.items || []).map((x) => x._idx).filter((n) => typeof n === 'number');
    indices.forEach((idx) => {
      if (!results[idx]) return;
      results[idx][field] = value;
      results[idx].sync_status = '';
      results[idx].sync_error = '';
    });
    this.setData({ results });
    this._recomputeView();
  },

  onPurchaseCategoryChange(e) {
    const { groupindex } = e.currentTarget.dataset;
    const pickIndex = e.detail.value;
    const value = this.data.categoryOptions[pickIndex];
    const groups = this.data.purchaseGroups || [];
    const group = groups[groupindex];
    if (!group) return;

    const results = this.data.results;
    const indices = (group.items || []).map((x) => x._idx).filter((n) => typeof n === 'number');
    indices.forEach((idx) => {
      if (!results[idx]) return;
      results[idx].category = value;
      results[idx].sync_status = '';
      results[idx].sync_error = '';
    });
    this.setData({ results });
    this._recomputeView();
  },

  removeResult(e) {
    const { index } = e.currentTarget.dataset;
    const results = this.data.results;
    results.splice(index, 1);
    this.setData({ results });
    this._recomputeView();
  },

  _validateBeforeSync() {
    if (this.data.module !== 'purchase') return { ok: true };
    const groups = this.data.purchaseGroups || [];
    const missing = groups.filter((g) => !String(g.category || '').trim()).map((g) => g.item_no || g.groupKey);
    if (missing.length > 0) {
      return { ok: false, message: `以下货号未选择品类：${missing.join('、')}` };
    }
    return { ok: true };
  },

  confirmSync() {
    if (this.data.results.length === 0) {
      wx.showToast({ title: '没有可同步的数据', icon: 'none' });
      return;
    }

    const v = this._validateBeforeSync();
    if (!v.ok) {
      wx.showModal({ title: '请完善信息', content: v.message, showCancel: false });
      return;
    }

    this.setData({ syncing: true, hasFailures: false, failures: [], syncSummary: null });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/api/sync`,
      method: 'POST',
      header: app.globalData.apiKey ? { 'x-api-key': app.globalData.apiKey } : {},
      data: {
        reviewed_data: this.data.results,
        task_id: this.data.taskId,
        db_task_id: this.data.dbTaskId,
        module: this.data.module
      },
      success: (res) => {
        const syncResults = (res.data && Array.isArray(res.data.results)) ? res.data.results : [];
        const failures = syncResults.filter(r => r.status === 'failed');
        const summary = {
          total: syncResults.length,
          success: syncResults.length - failures.length,
          failed: failures.length
        };

        this._applySyncStatuses(syncResults);
        this.setData({
          hasFailures: failures.length > 0,
          failures: failures,
          syncSummary: summary
        });

        if (res.data.success) {
          wx.showModal({
            title: '同步成功',
            content: `已成功同步至飞书多维表格`,
            showCancel: false,
            success: () => {
              wx.navigateBack({ delta: 2 }); // 返回首页
            }
          });
        } else if (res.statusCode === 207 || failures.length > 0) {
          wx.showModal({
            title: '部分同步失败',
            content: `成功 ${summary.success} 条，失败 ${summary.failed} 条。请查看失败明细并重试。`,
            showCancel: false
          });
        } else {
          wx.showToast({ title: res.data.error || '同步失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ syncing: false });
      }
    });
  },

  retrySync() {
    this.setData({ syncing: true });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/api/sync/retry`,
      method: 'POST',
      header: app.globalData.apiKey ? { 'x-api-key': app.globalData.apiKey } : {},
      data: {
        db_task_id: this.data.dbTaskId,
        task_id: this.data.taskId,
        module: this.data.module
      },
      success: (res) => {
        const syncResults = (res.data && Array.isArray(res.data.results)) ? res.data.results : [];
        const failures = syncResults.filter(r => r.status === 'failed');
        const summary = {
          total: syncResults.length,
          success: syncResults.length - failures.length,
          failed: failures.length
        };

        if (syncResults.length > 0) {
          this._applySyncStatuses(syncResults);
        }

        if (res.data.success) {
          this.setData({ hasFailures: false, failures: [], syncSummary: summary });
          wx.showModal({
            title: '重试成功',
            content: '所有失败记录已重新同步',
            showCancel: false,
            success: () => {
              wx.navigateBack({ delta: 2 });
            }
          });
        } else {
          this.setData({ hasFailures: failures.length > 0, failures: failures, syncSummary: summary });
          wx.showModal({
            title: '重试完成',
            content: `成功 ${summary.success} 条，失败 ${summary.failed} 条。请查看失败明细。`,
            showCancel: false
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '重试网络请求失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ syncing: false });
      }
    });
  }
});
