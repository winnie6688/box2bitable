Page({
  data: {
    results: [],
    syncing: false,
    hasFailures: false,
    failures: [],
    syncSummary: null
  },

  onLoad(options) {
    const app = getApp();
    if (app.globalData.lastResults) {
      this.setData({
        results: app.globalData.lastResults,
        taskId: app.globalData.lastTaskId,
        dbTaskId: app.globalData.lastDbTaskId
      });
      this._refreshSkuCodes();
      // 使用完后清空
      app.globalData.lastResults = null;
      app.globalData.lastTaskId = null;
      app.globalData.lastDbTaskId = null;
    } else if (options.results) {
      this.setData({
        results: JSON.parse(decodeURIComponent(options.results))
      });
      this._refreshSkuCodes();
    }
  },

  _generateSkuCode(itemNo, color, size) {
    const cleanNo = String(itemNo || '未知').trim().toUpperCase();
    const cleanColor = String(color || '默认').trim();
    const cleanSize = String(size || '均码').trim().toUpperCase();
    return `${cleanNo}-${cleanColor}-${cleanSize}`;
  },

  _refreshSkuCodes() {
    const results = (this.data.results || []).map(item => {
      return Object.assign({}, item, {
        sku_code: this._generateSkuCode(item.item_no, item.color, item.size)
      });
    });
    this.setData({ results });
  },

  _applySyncStatuses(syncResults) {
    const statusBySku = {};
    (syncResults || []).forEach(r => {
      const syncItem = (r && r.item) ? r.item : {};
      const sku = this._generateSkuCode(syncItem.item_no, syncItem.color, syncItem.size);
      statusBySku[sku] = { status: r.status, error: r.error || '' };
    });

    const results = (this.data.results || []).map(item => {
      const sku = this._generateSkuCode(item.item_no, item.color, item.size);
      const matched = statusBySku[sku];
      return Object.assign({}, item, {
        sku_code: sku,
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
    results[index].sku_code = this._generateSkuCode(results[index].item_no, results[index].color, results[index].size);
    results[index].sync_status = '';
    results[index].sync_error = '';
    this.setData({ results });
  },

  removeResult(e) {
    const { index } = e.currentTarget.dataset;
    const results = this.data.results;
    results.splice(index, 1);
    this.setData({ results });
  },

  confirmSync() {
    if (this.data.results.length === 0) {
      wx.showToast({ title: '没有可同步的数据', icon: 'none' });
      return;
    }

    this.setData({ syncing: true, hasFailures: false, failures: [], syncSummary: null });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/api/sync`,
      method: 'POST',
      data: {
        reviewed_data: this.data.results,
        task_id: this.data.taskId,
        db_task_id: this.data.dbTaskId
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
      data: {
        db_task_id: this.data.dbTaskId,
        task_id: this.data.taskId
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
