Page({
  data: {
    tempImagePath: '',
    loading: false,
    module: 'purchase',
    moduleLabel: '采购'
  },

  onLoad(options) {
    const moduleKey = options && options.module ? String(options.module) : 'purchase';
    const labelMap = { purchase: '采购', sales: '销售', inventory: '库存' };
    this.setData({
      module: moduleKey,
      moduleLabel: labelMap[moduleKey] || moduleKey
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          tempImagePath: res.tempFiles[0].tempFilePath
        });
      }
    });
  },

  uploadAndRecognize() {
    if (!this.data.tempImagePath) return;

    this.setData({ loading: true });
    const app = getApp();

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/api/recognition/upload`,
      filePath: this.data.tempImagePath,
      name: 'image',
      formData: {
        module: this.data.module
      },
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data.success) {
          // 将结果、任务ID和数据库任务ID存入全局变量
          app.globalData.lastResults = data.results;
          app.globalData.lastTaskId = data.task_id;
          app.globalData.lastDbTaskId = data.db_task_id;
          app.globalData.lastModule = data.module || this.data.module;
          // 跳转到复核页面
          wx.navigateTo({
            url: `/pages/review/review?module=${encodeURIComponent(data.module || this.data.module)}`
          });
        } else {
          wx.showToast({
            title: data.error || '识别失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  }
});
