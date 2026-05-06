const normalizeFieldName = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')');
};

class FeishuRecordRepository {
  constructor({ client, fieldMapCache, logFeishu, maskToken, sanitizeFieldsForLog }) {
    this.client = client;
    this._fieldMapCache = fieldMapCache;
    this.logFeishu = logFeishu;
    this.maskToken = maskToken;
    this.sanitizeFieldsForLog = sanitizeFieldsForLog;
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

  async mapFieldsToCanonicalNames(appToken, tableId, fieldsByName) {
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

  async findExistingRecord(target, { record_id, skuCode }) {
    let found = null;

    if (record_id) {
      const filter = `CurrentValue.[记录ID]="${record_id}"`;
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: target.appToken,
          table_id: target.tableId,
        },
        params: {
          filter,
          page_size: 1,
        },
      });

      if (searchResponse.code === 0 && searchResponse.data?.items?.length > 0) {
        found = searchResponse.data.items[0];
      }
    }

    if (!found) {
      const filter = `CurrentValue.[SKU_Code]="${skuCode}"`;
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: target.appToken,
          table_id: target.tableId,
        },
        params: {
          filter,
          page_size: 1,
        },
      });

      if (searchResponse.code !== 0) {
        this.logFeishu('[飞书同步] 检索记录原始返回:', searchResponse);
        throw new Error(`检索飞书记录失败: ${searchResponse.msg}`);
      }

      if (searchResponse.data?.items?.length > 0) {
        found = searchResponse.data.items[0];
      }
    }

    return found;
  }

  async createRecord(target, fieldsByName) {
    const mapped = await this.mapFieldsToCanonicalNames(target.appToken, target.tableId, fieldsByName);
    if (mapped.missing.length > 0) {
      throw new Error(`飞书字段不存在或字段名不匹配: ${mapped.missing.join(', ')}`);
    }

    this.logFeishu('[飞书同步] create 入参:', {
      module: target.module,
      path: {
        app_token: this.maskToken(target.appToken),
        table_id: this.maskToken(target.tableId),
      },
      fields: this.sanitizeFieldsForLog(fieldsByName),
    });

    const createResponse = await this.client.bitable.appTableRecord.create({
      path: {
        app_token: target.appToken,
        table_id: target.tableId,
      },
      data: {
        fields: mapped.fields,
      },
    });

    this.logFeishu('[飞书同步] create 原始返回:', createResponse);

    if (createResponse.code !== 0) {
      throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
    }

    return createResponse.data.record.record_id;
  }

  async updateRecord(target, recordId, fieldsByName) {
    const mapped = await this.mapFieldsToCanonicalNames(target.appToken, target.tableId, fieldsByName);
    if (mapped.missing.length > 0) {
      throw new Error(`飞书字段不存在或字段名不匹配: ${mapped.missing.join(', ')}`);
    }

    this.logFeishu('[飞书同步] update 入参:', {
      module: target.module,
      path: {
        app_token: this.maskToken(target.appToken),
        table_id: this.maskToken(target.tableId),
        record_id: recordId,
      },
      fields: this.sanitizeFieldsForLog(fieldsByName),
    });

    const updateResponse = await this.client.bitable.appTableRecord.update({
      path: {
        app_token: target.appToken,
        table_id: target.tableId,
        record_id: recordId,
      },
      data: {
        fields: mapped.fields,
      },
    });

    this.logFeishu('[飞书同步] update 原始返回:', updateResponse);

    if (updateResponse.code !== 0) {
      throw new Error(`飞书更新失败: ${updateResponse.msg} (Code: ${updateResponse.code})`);
    }

    return recordId;
  }
}

module.exports = {
  FeishuRecordRepository,
};

