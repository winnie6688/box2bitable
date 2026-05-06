const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const path = require('path');
const { resolveUploadPath } = require('../utils/upload');
const { generateSkuCode } = require('../utils/formatter');
const { getModuleConfig, normalizeModule } = require('../config/modules');
const { FeishuRecordRepository } = require('./feishu/recordRepository');
const salesWriter = require('./feishu/writers/salesWriter');
const purchaseWriter = require('./feishu/writers/purchaseWriter');
const inventoryWriter = require('./feishu/writers/inventoryWriter');

const FEISHU_DEBUG = process.env.FEISHU_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const FEISHU_DEBUG_SHOW_TOKENS = process.env.FEISHU_DEBUG_SHOW_TOKENS === 'true' && process.env.NODE_ENV !== 'production';

const stringifyForLog = (value, maxLen = 12000) => {
  try {
    const str = JSON.stringify(value);
    if (!str) return '';
    return str.length > maxLen ? `${str.slice(0, maxLen)}...(truncated)` : str;
  } catch (e) {
    return `"[unserializable:${e.message}]"`;
  }
};

const logFeishu = (prefix, payload) => {
  if (!FEISHU_DEBUG) return;
  console.log(prefix, stringifyForLog(payload));
};

const maskToken = (token) => {
  const str = String(token || '');
  if (!str) return '';
  if (FEISHU_DEBUG_SHOW_TOKENS) return str;
  if (str.length <= 10) return `${str.slice(0, 2)}***${str.slice(-2)}`;
  return `${str.slice(0, 4)}***${str.slice(-4)}`;
};

const extractFeishuCode = (resp) => {
  if (!resp || typeof resp !== 'object') return null;
  if (typeof resp.code === 'number') return resp.code;
  return null;
};

const extractFeishuMsg = (resp) => {
  if (!resp || typeof resp !== 'object') return '';
  if (typeof resp.msg === 'string') return resp.msg;
  if (typeof resp.message === 'string') return resp.message;
  return '';
};

const extractFileToken = (resp) => {
  if (!resp || typeof resp !== 'object') return '';
  return (
    resp.file_token ||
    (resp.data && resp.data.file_token) ||
    (resp.data && resp.data.data && resp.data.data.file_token) ||
    ''
  );
};

const sanitizeFieldsForLog = (fields) => {
  if (!fields || typeof fields !== 'object') return fields;
  const copy = Array.isArray(fields) ? fields.slice() : { ...fields };
  if (!Array.isArray(copy) && Array.isArray(copy['对应图片'])) {
    copy['对应图片'] = copy['对应图片'].map((it) => {
      if (!it || typeof it !== 'object') return it;
      const next = { ...it };
      if (next.file_token) next.file_token = maskToken(next.file_token);
      return next;
    });
  }
  return copy;
};

/**
 * Feishu Bitable Service
 * Handles data synchronization with Feishu Bitable (Upsert logic).
 */
class FeishuService {
  constructor() {
    this.client = new lark.Client({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
    });
    this.appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
    this.tableId = process.env.FEISHU_BITABLE_TABLE_ID;
    this._fieldMapCache = new Map();
    this._recordRepo = new FeishuRecordRepository({
      client: this.client,
      fieldMapCache: this._fieldMapCache,
      logFeishu,
      maskToken,
      sanitizeFieldsForLog,
    });
  }

  _getBitableTarget(moduleKey) {
    const module = normalizeModule(moduleKey);
    const cfg = getModuleConfig(module);
    return {
      module,
      appToken: cfg.bitable.appToken || this.appToken,
      tableId: cfg.bitable.tableId || this.tableId,
      writeMode: cfg.writeMode,
      fields: cfg.fields,
    };
  }

  /**
   * Synchronize aggregated SKU data to Bitable.
   * @param {Array} aggregatedData - Array of objects
   * @param {string} taskId - The filename of the original image
   * @param {string} preUploadedToken - (Optional) Pre-uploaded Feishu file token
   * @returns {Promise<Array>} - Sync results
   */
  async syncToBitable(aggregatedData, taskId, preUploadedToken = null, moduleKey = 'purchase') {
    const target = this._getBitableTarget(moduleKey);
    let fileToken = preUploadedToken;

    // 如果没有提前上传的 token，且有 taskId，则现场上传
    if (!fileToken && taskId) {
      try {
        fileToken = await this.uploadAttachment(taskId, target.appToken);
      } catch (error) {
        console.error('现场上传飞书附件失败:', error.message);
      }
    }
    logFeishu('[图片同步] syncToBitable 使用的 fileToken:', {
      module: target.module,
      tableId: maskToken(target.tableId),
      fileToken: maskToken(fileToken),
    });

    const results = [];
    for (const item of aggregatedData) {
      try {
        const syncResult = await this.upsertRecord(item, fileToken, target);
        results.push({ item, status: 'success', recordId: syncResult });
      } catch (error) {
        console.error(`Error syncing item ${item.item_no}:`, error.message);
        results.push({ item, status: 'failed', error: error.message });
      }
    }
    return results;
  }

  /**
   * Upload local file to Feishu Bitable attachments
   * @param {string} filename 
   * @param {string} appToken
   */
  async uploadAttachment(filename, appToken) {
    const filePath = resolveUploadPath(filename);
    if (!filePath) {
      console.error('[图片同步] 非法文件名:', filename);
      return null;
    }
    console.log(`[图片同步] 准备上传文件: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[图片同步] 服务器未找到文件: ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    try {
      const parentNode = appToken || this.appToken;
      console.log(`[图片同步] 正在调用飞书上传接口, 文件大小: ${stats.size} bytes`);

      logFeishu('[图片同步] uploadAll 入参:', {
        file_name: filename,
        parent_type: 'bitable_image',
        parent_node: maskToken(parentNode),
        size: stats.size,
      });

      const createResponse = await this.client.drive.media.uploadAll({
        data: {
          file_name: filename,
          parent_type: 'bitable_image',
          parent_node: parentNode,
          size: stats.size,
          file: fs.createReadStream(filePath),
        },
      });

      logFeishu('[图片同步] uploadAll 原始返回:', createResponse);

      if (!createResponse) {
        console.error('[图片同步] 飞书上传接口无返回数据');
        return null;
      }

      const respCode = extractFeishuCode(createResponse);
      if (respCode !== null && respCode !== 0) {
        const msg = extractFeishuMsg(createResponse);
        console.error(`[图片同步] 飞书上传接口返回错误: ${msg} (代码: ${respCode})`);
        return null;
      }

      const token = extractFileToken(createResponse);
      if (!token) {
        console.error('[图片同步] 飞书上传成功但未返回 file_token');
        return null;
      }
      console.log(`[图片同步] 成功获取 file_token: ${maskToken(token)}`);
      return token;
    } catch (err) {
      console.error(`[图片同步] 上传过程中出现异常:`, err.message);
      return null;
    }
  }

  /**
   * Upsert a single record: Search -> Update or Create
   * @param {Object} item - SKU item data
   * @param {string} fileToken - Feishu attachment file token
   */
  async upsertRecord(item, fileToken, target) {
    const resolvedTarget = target || this._getBitableTarget('purchase');
    const { item_no, color, size } = item;
    const skuCode = generateSkuCode(item_no, color, size);

    if (resolvedTarget.writeMode === 'create_detail') {
      return salesWriter.write({
        item,
        fileToken,
        target: resolvedTarget,
        repo: this._recordRepo,
      });
    }

    logFeishu('[飞书同步] 本次写入使用的 fileToken:', {
      fileToken: maskToken(fileToken),
      hasFileToken: Boolean(fileToken),
    });

    if (resolvedTarget.module === 'purchase') {
      return purchaseWriter.write({
        item,
        fileToken,
        target: resolvedTarget,
        repo: this._recordRepo,
        skuCode,
      });
    }

    if (resolvedTarget.module === 'inventory') {
      return inventoryWriter.write({
        item,
        fileToken,
        target: resolvedTarget,
        repo: this._recordRepo,
        skuCode,
      });
    }

    throw new Error(`Unsupported module: ${resolvedTarget.module}`);
  }
}

module.exports = new FeishuService();
