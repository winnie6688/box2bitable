const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const path = require('path');

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
  }

  /**
   * Synchronize aggregated SKU data to Bitable.
   * @param {Array} aggregatedData - Array of objects
   * @param {string} taskId - The filename of the original image
   * @param {string} preUploadedToken - (Optional) Pre-uploaded Feishu file token
   * @returns {Promise<Array>} - Sync results
   */
  async syncToBitable(aggregatedData, taskId, preUploadedToken = null) {
    let fileToken = preUploadedToken;

    // 如果没有提前上传的 token，且有 taskId，则现场上传
    if (!fileToken && taskId) {
      try {
        fileToken = await this.uploadAttachment(taskId);
      } catch (error) {
        console.error('现场上传飞书附件失败:', error.message);
      }
    }

    const results = [];
    for (const item of aggregatedData) {
      try {
        const syncResult = await this.upsertRecord(item, fileToken);
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
    const filePath = path.join(__dirname, '../../uploads', filename);
    console.log(`[ImageSync] Preparing to upload: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[ImageSync] File not found on server: ${filePath}`);
      return null;
    }

    const stats = fs.statSync(filePath);
    try {
      const createResponse = await this.client.bitable.appAttachment.create({
        path: {
          app_token: this.appToken,
        },
        data: {
          file_name: filename,
          file_size: stats.size,
          content: fs.createReadStream(filePath),
        },
      });

      if (createResponse.code !== 0) {
        console.error(`[ImageSync] Feishu upload failed: ${createResponse.msg}`);
        return null;
      }

      const token = createResponse.data.file_token;
      console.log(`[ImageSync] Successfully got file_token: ${token}`);
      return token;
    } catch (err) {
      console.error(`[ImageSync] Exception during upload:`, err.message);
      return null;
    }
  }

  /**
   * Upsert a single record: Search -> Update or Create
   * @param {Object} item - SKU item data
   * @param {string} fileToken - Feishu attachment file token
   */
  async upsertRecord(item, fileToken) {
    const { item_no, color, size, quantity, supplier } = item;

    // 1. Search for existing record
    const filter = `AND(CurrentValue.[货号]="${item_no}", CurrentValue.[颜色]="${color}", CurrentValue.[尺码]=${size})`;
    
    const searchResponse = await this.client.bitable.appTableRecord.list({
      path: {
        app_token: this.appToken,
        table_id: this.tableId,
      },
      params: {
        filter: filter,
        page_size: 1,
      },
    });

    const records = searchResponse.data.items || [];

    // Prepare attachment field if fileToken exists
    const attachmentField = fileToken ? [{ file_token: fileToken }] : [];

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

      const updateResponse = await this.client.bitable.appTableRecord.update({
        path: {
          app_token: this.appToken,
          table_id: this.tableId,
          record_id: recordId,
        },
        data: {
          fields: updateData,
        },
      });

      if (updateResponse.code !== 0) {
        throw new Error(`飞书更新失败: ${updateResponse.msg} (Code: ${updateResponse.code})`);
      }

      console.log(`Updated record ${recordId} for SKU ${item_no}`);
      return recordId;
    } else {
      // 3. Case: Record doesn't exist -> Create new
      const createResponse = await this.client.bitable.appTableRecord.create({
        path: {
          app_token: this.appToken,
          table_id: this.tableId,
        },
        data: {
          fields: {
            '货号': item_no,
            '颜色': color,
            '尺码': Number(size),
            '供应商': supplier || '',
            '数量': Number(quantity),
            '对应图片': attachmentField,
          },
        },
      });

      if (createResponse.code !== 0) {
        throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
      }

      return createResponse.data.record.record_id;
    }
  }
}

module.exports = new FeishuService();
