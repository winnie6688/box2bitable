const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../utils/upload');
const { generateSkuCode } = require('../utils/formatter');
const { getModuleConfig, normalizeModule } = require('../config/modules');

const FEISHU_DEBUG = process.env.FEISHU_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const FEISHU_DEBUG_SHOW_TOKENS = process.env.FEISHU_DEBUG_SHOW_TOKENS === 'true';

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

const normalizeFieldName = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')');
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

  async _getFieldNameMap(appToken, tableId) {
    const cacheKey = `${appToken}::${tableId}`;
    const cached = this._fieldMapCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;

    const nameToName = {};
    const normalizedToName = {};
    let pageToken = undefined;

    for (let i = 0; i < 20; i++) {
      const resp = await this.client.bitable.appTableField.list({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
        params: {
          page_size: 200,
          page_token: pageToken,
        },
      });

      if (resp.code !== 0) {
        throw new Error(`获取飞书字段列表失败: ${resp.msg} (Code: ${resp.code})`);
      }

      const items = resp.data?.items || [];
      for (const f of items) {
        const fieldName = f.field_name;
        if (!fieldName) continue;
        nameToName[fieldName] = fieldName;
        normalizedToName[normalizeFieldName(fieldName)] = fieldName;
      }

      if (!resp.data?.has_more) break;
      pageToken = resp.data?.page_token;
      if (!pageToken) break;
    }

    const value = { nameToName, normalizedToName };
    this._fieldMapCache.set(cacheKey, { value, expiresAt: now + 10 * 60 * 1000 });
    return value;
  }

  async _mapFieldsToCanonicalNames(appToken, tableId, fieldsByName) {
    const { nameToName, normalizedToName } = await this._getFieldNameMap(appToken, tableId);
    const out = {};
    const missing = [];
    Object.keys(fieldsByName || {}).forEach((k) => {
      const v = fieldsByName[k];
      const direct = nameToName[k];
      const normalized = normalizedToName[normalizeFieldName(k)];
      const fieldName = direct || normalized;
      if (!fieldName) missing.push(k);
      out[fieldName || k] = v;
    });
    return { fields: out, missing };
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
        fileToken = await this.uploadAttachment(taskId);
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
   */
  async uploadAttachment(filename) {
    const filePath = path.join(uploadDir, filename);
    console.log(`[图片同步] 准备上传文件: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[图片同步] 服务器未找到文件: ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    try {
      console.log(`[图片同步] 正在调用飞书上传接口, 文件大小: ${stats.size} bytes`);

      logFeishu('[图片同步] uploadAll 入参:', {
        file_name: filename,
        parent_type: 'bitable_image',
        parent_node: maskToken(this.appToken),
        size: stats.size,
      });

      const createResponse = await this.client.drive.media.uploadAll({
        data: {
          file_name: filename,
          parent_type: 'bitable_image',
          parent_node: this.appToken,
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
    const { record_id, item_no, color, size, quantity, supplier } = item;

    const skuCode = generateSkuCode(item_no, color, size);

    if (resolvedTarget.writeMode === 'create_detail') {
      const attachmentField = fileToken ? [{ file_token: fileToken }] : [];
      const createFields = {
        '货号': item_no,
        '颜色': color,
        '尺码': Number(size),
        '数量': Number(quantity),
        '金额（元）': item.amount != null && item.amount !== '' ? Number(item.amount) : undefined,
        '支付方式': item.pay_method || undefined,
        '备注': item.remark || '',
        '对应图片': attachmentField,
      };

      Object.keys(createFields).forEach((k) => {
        if (createFields[k] === undefined) delete createFields[k];
      });

      const mapped = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, createFields);
      if (mapped.missing.length > 0) {
        throw new Error(`飞书字段不存在或字段名不匹配: ${mapped.missing.join(', ')}`);
      }

      logFeishu('[飞书同步] sales create 入参:', {
        path: {
          app_token: maskToken(resolvedTarget.appToken),
          table_id: maskToken(resolvedTarget.tableId),
        },
        fields: sanitizeFieldsForLog(createFields),
      });

      const createResponse = await this.client.bitable.appTableRecord.create({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        data: {
          fields: mapped.fields,
        },
      });

      logFeishu('[飞书同步] sales create 原始返回:', createResponse);
      if (createResponse.code !== 0) {
        throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
      }
      return createResponse.data.record.record_id;
    }

    let records = [];

    // 1. 如果前端传来了明确的 record_id (飞书记录ID)，优先通过 ID 精确检索
    if (record_id) {
      console.log(`[飞书同步] 使用精确记录ID检索, record_id: ${record_id}`);
      const filter = `CurrentValue.[记录ID]="${record_id}"`;
      
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        params: {
          filter: filter,
          page_size: 1,
        },
      });

      if (searchResponse.code === 0 && searchResponse.data.items && searchResponse.data.items.length > 0) {
        records = searchResponse.data.items;
        console.log(`[飞书同步] 记录ID匹配成功，找到对应记录`);
      } else {
        console.log(`[飞书同步] 记录ID未匹配到数据，回退到 SKU_Code 检索`);
      }
    }

    // 2. 如果没有提供 record_id，或者根据 record_id 没找到，则回退使用 SKU_Code 检索
    if (records.length === 0) {
      const filter = `CurrentValue.[SKU_Code]="${skuCode}"`;
      console.log(`[飞书同步] 正在使用 SKU_Code 检索现有记录, Filter: ${filter}`);
      
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        params: {
          filter: filter,
          page_size: 1,
        },
      });

      if (searchResponse.code !== 0) {
        console.error(`[飞书同步] 检索记录失败: ${searchResponse.msg} (代码: ${searchResponse.code})`);
        logFeishu('[飞书同步] 检索记录原始返回:', searchResponse);
        throw new Error(`检索飞书记录失败: ${searchResponse.msg}`);
      }

      records = searchResponse.data.items || [];
      console.log(`[飞书同步] 组合检索完成，找到记录数: ${records.length}`);
    }

    // Prepare attachment field if fileToken exists
    const attachmentField = fileToken ? [{ file_token: fileToken }] : [];
    logFeishu('[飞书同步] 本次写入使用的 fileToken:', {
      fileToken: maskToken(fileToken),
      attachmentFieldLen: attachmentField.length,
    });

    if (records.length > 0) {
      // 2. Case: Record exists -> Update quantity and image
      const existingRecord = records[0];
      const recordId = existingRecord.record_id;
      const fields = existingRecord.fields || {};
      const oldQuantity = fields['数量'] || 0;
      const newQuantity = Number(oldQuantity) + Number(quantity);

      const updateData = {
        '数量': newQuantity,
      };

      // Only update image if we have a new one
      if (fileToken) {
        updateData['对应图片'] = attachmentField;
      }

      if (resolvedTarget.module === 'purchase') {
        const existingCategory = fields['品类'];
        const incomingCategory = item.category;
        if (!existingCategory && incomingCategory) {
          updateData['品类'] = incomingCategory;
        } else if (existingCategory && incomingCategory && String(existingCategory) !== String(incomingCategory)) {
          throw new Error(`品类与已存在记录不一致: 当前=${incomingCategory}, 已存在=${existingCategory}`);
        }
      }

      logFeishu('[飞书同步] update 入参:', {
        path: {
          app_token: maskToken(resolvedTarget.appToken),
          table_id: maskToken(resolvedTarget.tableId),
          record_id: recordId,
        },
        fields: sanitizeFieldsForLog(updateData),
      });

      const mappedUpdate = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, updateData);
      if (mappedUpdate.missing.length > 0) {
        throw new Error(`飞书字段不存在或字段名不匹配: ${mappedUpdate.missing.join(', ')}`);
      }

      const updateResponse = await this.client.bitable.appTableRecord.update({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
          record_id: recordId,
        },
        data: {
          fields: mappedUpdate.fields,
        },
      });

      logFeishu('[飞书同步] update 原始返回:', updateResponse);

      if (updateResponse.code !== 0) {
        throw new Error(`飞书更新失败: ${updateResponse.msg} (Code: ${updateResponse.code})`);
      }

      console.log(`Updated record ${recordId} for SKU ${item_no}`);
      return recordId;
    } else {
      // 3. Case: Record doesn't exist -> Create new
      const createFields = {
        'SKU_Code': skuCode,
        '货号': item_no,
        '颜色': color,
        '尺码': Number(size),
        ...(resolvedTarget.fields?.hasSupplier ? { '供应商': supplier || '' } : {}),
        ...(resolvedTarget.module === 'purchase' ? { '品类': item.category || '' } : {}),
        '数量': Number(quantity),
        '对应图片': attachmentField,
      };

      const mappedCreate = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, createFields);
      if (mappedCreate.missing.length > 0) {
        throw new Error(`飞书字段不存在或字段名不匹配: ${mappedCreate.missing.join(', ')}`);
      }

      logFeishu('[飞书同步] create 入参:', {
        path: {
          app_token: maskToken(resolvedTarget.appToken),
          table_id: maskToken(resolvedTarget.tableId),
        },
        fields: sanitizeFieldsForLog(createFields),
      });

      const createResponse = await this.client.bitable.appTableRecord.create({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        data: {
          fields: {
            ...mappedCreate.fields,
          },
        },
      });

      logFeishu('[飞书同步] create 原始返回:', createResponse);

      if (createResponse.code !== 0) {
        throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
      }

      return createResponse.data.record.record_id;
    }
  }
}

module.exports = new FeishuService();
