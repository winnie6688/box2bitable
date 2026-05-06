const normalizePath = (p) => String(p || '').trim().replace(/^`|`$/g, '');

const getExtname = (p) => {
  const s = normalizePath(p);
  const i = s.lastIndexOf('.');
  if (i <= -1) return '';
  const ext = s.slice(i);
  if (ext.includes('/') || ext.includes('\\')) return '';
  return ext.toLowerCase();
};

const extToMime = (ext) => {
  const e = normalizePath(ext).toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  return '';
};

const isRemotePath = (p) => /^https?:\/\//i.test(normalizePath(p));

const ensureLocalFilePath = (p) => {
  const src = normalizePath(p);
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

Page({
  data: {
    tempImagePath: '',
    loading: false,
    module: 'purchase',
    moduleLabel: '采购',
    debug: {
      buildAt: '',
      envVersion: '',
      platform: '',
      libVersion: '',
    },
    fatalError: ''
  },

  onLoad(options) {
    try {
      const moduleKey = options && options.module ? String(options.module) : 'purchase';
      const labelMap = { purchase: '采购', sales: '销售', inventory: '库存' };
      const app = getApp();
      const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
      this.setData({
        module: moduleKey,
        moduleLabel: labelMap[moduleKey] || moduleKey,
        fatalError: (app && app.globalData && app.globalData.lastError) ? String(app.globalData.lastError) : '',
        debug: {
          buildAt: (app && app.globalData && app.globalData.buildAt) ? String(app.globalData.buildAt) : '',
          envVersion: (wx.getAccountInfoSync && wx.getAccountInfoSync().miniProgram && wx.getAccountInfoSync().miniProgram.envVersion) || '',
          platform: sys.platform || '',
          libVersion: sys.SDKVersion || sys.version || '',
        },
      });
    } catch (e) {
      this.setData({
        fatalError: (e && e.message) ? e.message : String(e || 'unknown error'),
      });
    }
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

    (async () => {
      try {
        const originalPath = normalizePath(this.data.tempImagePath);
        let localPath = originalPath;
        if (isRemotePath(originalPath)) localPath = await ensureLocalFilePath(originalPath);

        const maxClientBytes = 4 * 1024 * 1024;
        const preparedPath = await compressIfNeeded(localPath, maxClientBytes);
        if (preparedPath && preparedPath !== this.data.tempImagePath) this.setData({ tempImagePath: preparedPath });

        const baseUrl = app && app.globalData ? String(app.globalData.baseUrl || '') : '';
        if (!baseUrl) {
          throw new Error('缺少后端 baseUrl 配置，无法上传图片');
        }

        const uploadResp = await new Promise((resolve, reject) => {
          wx.uploadFile({
            url: `${baseUrl}/api/recognition/upload`,
            filePath: preparedPath,
            name: 'image',
            formData: {
              module: this.data.module,
            },
            success: resolve,
            fail: reject,
          });
        });

        const statusCode = uploadResp && typeof uploadResp.statusCode === 'number' ? uploadResp.statusCode : 200;
        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`上传失败 HTTP ${statusCode}`);
        }

        let data = uploadResp && uploadResp.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {
            throw new Error('上传返回解析失败');
          }
        }

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
