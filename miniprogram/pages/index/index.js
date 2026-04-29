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

const isRemotePath = (p) => /^https?:\/\//i.test(String(p || ''));

const ensureLocalFilePath = (p) => {
  const src = String(p || '');
  if (!isRemotePath(src)) return Promise.resolve(src);
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: src,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`downloadFile:fail status=${res.statusCode || 'unknown'}`));
      },
      fail: (err) => reject(err),
    });
  });
};

const getFileSize = (filePath) => {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size || 0)),
      fail: () => resolve(0),
    });
  });
};

const compressIfNeeded = async (filePath, maxBytes) => {
  let current = filePath;
  let size = await getFileSize(current);
  if (!size || size <= maxBytes) return current;

  const qualities = [80, 60, 40];
  for (const q of qualities) {
    const nextPath = await new Promise((resolve, reject) => {
      wx.compressImage({
        src: current,
        quality: q,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err),
      });
    });
    current = nextPath;
    size = await getFileSize(current);
    if (size && size <= maxBytes) return current;
  }
  return current;
};

const getMimeForPath = (filePath) => {
  const ext = getExtname(filePath);
  const byExt = extToMime(ext);
  if (byExt) return Promise.resolve(byExt);
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: filePath,
      success: (res) => {
        const t = String(res.type || '').toLowerCase();
        if (t === 'jpg' || t === 'jpeg') return resolve('image/jpeg');
        if (t === 'png') return resolve('image/png');
        if (t === 'webp') return resolve('image/webp');
        resolve('');
      },
      fail: () => resolve('')
    });
  });
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
    (async () => {
      try {
        const localPath = await ensureLocalFilePath(this.data.tempImagePath);
        const maxClientBytes = 4 * 1024 * 1024;
        const preparedPath = await compressIfNeeded(localPath, maxClientBytes);
        if (preparedPath && preparedPath !== this.data.tempImagePath) this.setData({ tempImagePath: preparedPath });

        const mime = await getMimeForPath(preparedPath);
        if (!mime) {
          wx.showToast({ title: '不支持的图片类型', icon: 'none' });
          return;
        }

        const arrayBuffer = await new Promise((resolve, reject) => {
          fs.readFile({
            filePath: preparedPath,
            success: (r) => resolve(r.data),
            fail: (err) => reject(err),
          });
        });

        const base64 =
          typeof arrayBuffer === 'string' ? arrayBuffer : wx.arrayBufferToBase64(arrayBuffer);

        const data = await requestJson({
          path: '/api/recognition/upload',
          method: 'POST',
          data: {
            module: this.data.module,
            image_base64: `data:${mime};base64,${base64}`,
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
        console.error('读取或上传图片失败:', this.data.tempImagePath, e);
        wx.showToast({ title: (e && e.errMsg) || e.message || '读取图片失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    })();
  }
});
