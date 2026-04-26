const { baseUrl, apiKey } = require('./config');

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  globalData: {
    // 修改为你的后端服务器地址
    baseUrl,
    apiKey
  }
})
