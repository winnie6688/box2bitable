const { baseUrl, apiKey, cloudEnvId, cloudService } = require('./config');

App({
  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    if (wx.cloud && typeof wx.cloud.init === 'function' && cloudEnvId) {
      wx.cloud.init({ env: cloudEnvId, traceUser: true });
    }
  },
  globalData: {
    baseUrl,
    apiKey,
    cloudEnvId,
    cloudService,
  }
})
