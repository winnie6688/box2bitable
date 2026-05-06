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

let localConfig = {};
try {
  localConfig = require('./config.local');
} catch (e) {
  localConfig = {};
}

const baseUrlByEnv = {
  develop: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
  trial: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
  release: 'https://box2bitable-249568-6-1424272965.sh.run.tcloudbase.com',
};

if (localConfig && localConfig.baseUrlByEnv && typeof localConfig.baseUrlByEnv === 'object') {
  Object.assign(baseUrlByEnv, localConfig.baseUrlByEnv);
}

const baseUrl = Object.prototype.hasOwnProperty.call(baseUrlByEnv, envVersion)
  ? baseUrlByEnv[envVersion]
  : baseUrlByEnv.release;

const cloudEnvIdByEnv = {
  develop: 'prod-d6gwsf3w487222b9f',
  trial: 'prod-d6gwsf3w487222b9f',
  release: 'prod-d6gwsf3w487222b9f',
};

if (localConfig && localConfig.cloudEnvIdByEnv && typeof localConfig.cloudEnvIdByEnv === 'object') {
  Object.assign(cloudEnvIdByEnv, localConfig.cloudEnvIdByEnv);
}

const cloudEnvId = Object.prototype.hasOwnProperty.call(cloudEnvIdByEnv, envVersion)
  ? cloudEnvIdByEnv[envVersion]
  : cloudEnvIdByEnv.release;

const cloudServiceByEnv = {
  develop: 'box2bitable',
  trial: 'box2bitable',
  release: 'box2bitable',
};

if (localConfig && localConfig.cloudServiceByEnv && typeof localConfig.cloudServiceByEnv === 'object') {
  Object.assign(cloudServiceByEnv, localConfig.cloudServiceByEnv);
}

const cloudService = Object.prototype.hasOwnProperty.call(cloudServiceByEnv, envVersion)
  ? cloudServiceByEnv[envVersion]
  : cloudServiceByEnv.release;

const apiKeyByEnv = {
  develop: '',
  trial: '',
  release: '',
};

if (localConfig && localConfig.apiKeyByEnv && typeof localConfig.apiKeyByEnv === 'object') {
  Object.assign(apiKeyByEnv, localConfig.apiKeyByEnv);
}

const apiKey = Object.prototype.hasOwnProperty.call(apiKeyByEnv, envVersion)
  ? apiKeyByEnv[envVersion]
  : apiKeyByEnv.release;

module.exports = {
  envVersion,
  baseUrl,
  cloudEnvId,
  cloudService,
  apiKey,
};
