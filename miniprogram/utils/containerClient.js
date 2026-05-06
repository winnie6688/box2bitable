const buildQuery = (params) => {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  const q = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
};

const getCloudConfig = () => {
  const app = getApp();
  const cloudEnvId = app && app.globalData ? app.globalData.cloudEnvId : '';
  const cloudService = app && app.globalData ? app.globalData.cloudService : '';
  const apiKey = app && app.globalData ? app.globalData.apiKey : '';
  const baseUrl = app && app.globalData ? app.globalData.baseUrl : '';
  return { cloudEnvId, cloudService, apiKey, baseUrl };
};

const callContainer = ({ path, method = 'GET', data, header }) => {
  const { cloudEnvId, cloudService, apiKey, baseUrl } = getCloudConfig();
  const m = String(method || 'GET').toUpperCase();

  if (wx.cloud && typeof wx.cloud.callContainer === 'function' && cloudEnvId && cloudService) {
    const fullPath = m === 'GET' ? `${path}${buildQuery(data)}` : path;
    const h = Object.assign(
      {},
      { 'content-type': 'application/json', 'X-WX-SERVICE': cloudService },
      apiKey ? { 'x-api-key': apiKey } : {},
      header || {}
    );

    return new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: { env: cloudEnvId },
        path: fullPath,
        method: m,
        header: h,
        data: m === 'GET' ? undefined : (data || {}),
        success: resolve,
        fail: reject,
      });
    });
  }

  if (!baseUrl) {
    return Promise.reject(new Error('Missing cloudEnvId/cloudService and baseUrl'));
  }

  const url = m === 'GET' ? `${baseUrl}${path}${buildQuery(data)}` : `${baseUrl}${path}`;
  const h = Object.assign({}, apiKey ? { 'x-api-key': apiKey } : {}, header || {});
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: m,
      header: h,
      data: m === 'GET' ? undefined : (data || {}),
      success: resolve,
      fail: reject,
    });
  });
};

const requestJson = async (opts) => {
  const res = await callContainer(opts);
  const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 200;
  if (statusCode >= 200 && statusCode < 300) return res.data;
  const msg = (res && res.data && (res.data.error || res.data.message)) || `HTTP ${statusCode}`;
  const err = new Error(msg);
  err.statusCode = statusCode;
  err.response = res;
  throw err;
};

module.exports = {
  requestJson,
};

