Page({
  data: {
    tempImagePath: '',
    loading: false
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
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data.success) {
          // 将结果、任务ID和数据库任务ID存入全局变量
          app.globalData.lastResults = data.results;
          app.globalData.lastTaskId = data.task_id;
          app.globalData.lastDbTaskId = data.db_task_id;
          // 跳转到复核页面
          wx.navigateTo({
            url: '/pages/review/review'
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
