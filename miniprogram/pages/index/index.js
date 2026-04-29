const { requestJson } = require('../../utils/containerClient');

const getExtname = (p) => {
  const s = String(p || '');
  const i = s.lastIndexOf('.');
  if (i <= -1) return '';
  const ext = s.slice(i);
  if (ext.includes('/') || ext.includes('\\')) return '';
  return ext.toLowerCase();
};

const extToMime = (ext) => {
  const e = String(ext || '').toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  return '';
};

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

    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: this.data.tempImagePath,
      encoding: 'base64',
      success: async (r) => {
        try {
          const ext = getExtname(this.data.tempImagePath);
          const mime = extToMime(ext);
          if (!mime) {
            wx.showToast({ title: '不支持的图片类型', icon: 'none' });
            return;
          }

          const data = await requestJson({
            path: '/api/recognition/upload',
            method: 'POST',
            data: {
              module: this.data.module,
              image_base64: `data:${mime};base64,${r.data}`,
            },
          });

          if (data && data.success) {
            app.globalData.lastResults = data.results;
            app.globalData.lastTaskId = data.task_id;
            app.globalData.lastDbTaskId = data.db_task_id;
            app.globalData.lastModule = data.module || this.data.module;
            wx.navigateTo({
              url: `/pages/review/review?module=${encodeURIComponent(data.module || this.data.module)}`
            });
          } else {
            wx.showToast({ title: (data && data.error) || '识别失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: e.message || '网络请求失败', icon: 'none' });
        } finally {
          this.setData({ loading: false });
        }
      },
      fail: () => {
        wx.showToast({ title: '读取图片失败', icon: 'none' });
        this.setData({ loading: false });
      },
    });
  }
});
