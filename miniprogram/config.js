const getEnvVersion = () => {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.envVersion;
    return v || 'develop';
  } catch (e) {
    return 'develop';
  }
};

const envVersion = getEnvVersion();

const baseUrlByEnv = {
  develop: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
  trial: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
  release: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
};

const baseUrl = baseUrlByEnv[envVersion] || baseUrlByEnv.release;

const apiKeyByEnv = {
  develop: '',
  trial: '',
  release: '',
};

const apiKey = apiKeyByEnv[envVersion] || apiKeyByEnv.release;

module.exports = {
  envVersion,
  baseUrl,
  apiKey,
};
