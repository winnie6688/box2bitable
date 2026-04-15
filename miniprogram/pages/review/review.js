Page({
  data: {
    results: [],
    syncing: false,
    hasFailures: false,
    failures: []
  },

  onLoad(options) {
    const app = getApp();
    if (app.globalData.lastResults) {
      this.setData({
        results: app.globalData.lastResults,
        taskId: app.globalData.lastTaskId,
        dbTaskId: app.globalData.lastDbTaskId
      });
      // 使用完后清空
      app.globalData.lastResults = null;
      app.globalData.lastTaskId = null;
      app.globalData.lastDbTaskId = null;
    } else if (options.results) {
      this.setData({
        results: JSON.parse(decodeURIComponent(options.results))
      });
    }
  },

  onInputChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const results = this.data.results;
    results[index][field] = value;
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

    this.setData({ syncing: true });
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
        if (res.data.success) {
          wx.showModal({
            title: '同步成功',
            content: `已成功同步至飞书多维表格`,
            showCancel: false,
            success: () => {
              wx.navigateBack({ delta: 2 }); // 返回首页
            }
          });
        } else if (res.statusCode === 207) {
          // Partial failures
          const failures = res.data.results.filter(r => r.status === 'failed');
          this.setData({
            hasFailures: true,
            failures: failures
          });
          wx.showToast({
            title: `部分同步失败 (${failures.length} 条)`,
            icon: 'none',
            duration: 3000
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
        if (res.data.success) {
          this.setData({ hasFailures: false });
          wx.showModal({
            title: '重试成功',
            content: '所有失败记录已重新同步',
            showCancel: false,
            success: () => {
              wx.navigateBack({ delta: 2 });
            }
          });
        } else {
          wx.showToast({
            title: res.data.message || '重试仍有失败',
            icon: 'none'
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
