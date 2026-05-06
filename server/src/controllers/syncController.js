const feishuService = require('../services/feishuService');
const path = require('path');
const fs = require('fs');
const { resolveUploadPath } = require('../utils/upload');
const { generateSkuCode } = require('../utils/formatter');
const { normalizeModule } = require('../config/modules');

/**
 * Sync Controller
 * Handles synchronization of reviewed data to Feishu Bitable.
 */
const syncData = async (req, res) => {
  try {
    const { reviewed_data, task_id, module: moduleRaw, file_token, feishu_file_token } = req.body;
    const module = normalizeModule(moduleRaw);

    if (!reviewed_data || !Array.isArray(reviewed_data)) {
      return res.status(400).json({ success: false, error: '无效的复核数据' });
    }

    let aggregatedList = reviewed_data;
    if (module !== 'sales') {
      const aggregationMap = {};
      reviewed_data.forEach(item => {
        const key = generateSkuCode(item.item_no, item.color, item.size);
        if (aggregationMap[key]) {
          aggregationMap[key].quantity += 1;
        } else {
          aggregationMap[key] = {
            ...item,
            quantity: 1
          };
        }
      });
      aggregatedList = Object.values(aggregationMap);
    } else {
      aggregatedList = reviewed_data.map((item) => ({
        ...item,
        quantity: item.quantity != null && item.quantity !== '' ? Number(item.quantity) : 1,
        amount: item.amount != null && item.amount !== '' ? Number(item.amount) : undefined,
      }));
    }
    
    // 2. 获取提前上传的飞书 Token（由前端透传；若没有则同步阶段尝试上传）
    const feishuFileToken = String(file_token || feishu_file_token || '').trim() || null;

    // 3. Sync to Feishu (Passing fileToken)
    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken, module);

    // 4. Check for failures
    const failures = syncResults.filter(r => r.status === 'failed');
    
    if (failures.length > 0) {
      return res.status(207).json({
        success: false,
        message: `同步完成，但有 ${failures.length} 条数据失败`,
        results: syncResults
      });
    }

    // 5. Cleanup: Delete temporary image file on full success
    if (task_id) {
      const filePath = resolveUploadPath(task_id);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[清理] 成功删除临时文件: ${task_id}`);
        } catch (cleanupError) {
          console.error(`[清理] 删除文件失败: ${cleanupError.message}`);
        }
      }
    }

    res.json({
      success: true,
      message: '数据已成功同步至飞书多维表格',
      results: syncResults
    });

  } catch (error) {
    console.error('同步控制器错误:', error);
    res.status(500).json({
      success: false,
      error: '同步过程中出现异常: ' + error.message
    });
  }
};

/**
 * Retry Sync Controller
 * Retries failed records for a specific task.
 */
const retrySync = async (req, res) => {
  try {
    const { reviewed_data, task_id, module: moduleRaw, file_token, feishu_file_token } = req.body;
    const module = normalizeModule(moduleRaw);

    if (!reviewed_data || !Array.isArray(reviewed_data) || reviewed_data.length === 0) {
      return res.status(400).json({ success: false, error: '缺少需要重试的记录（reviewed_data）' });
    }

    let aggregatedList = reviewed_data;
    if (module !== 'sales') {
      const aggregationMap = {};
      reviewed_data.forEach(item => {
        const key = generateSkuCode(item.item_no, item.color, item.size);
        if (aggregationMap[key]) {
          aggregationMap[key].quantity += 1;
        } else {
          aggregationMap[key] = {
            ...item,
            quantity: 1
          };
        }
      });
      aggregatedList = Object.values(aggregationMap);
    } else {
      aggregatedList = reviewed_data.map((item) => ({
        ...item,
        quantity: item.quantity != null && item.quantity !== '' ? Number(item.quantity) : 1,
        amount: item.amount != null && item.amount !== '' ? Number(item.amount) : undefined,
      }));
    }

    const feishuFileToken = String(file_token || feishu_file_token || '').trim() || null;
    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken, module);
    const finalFailures = syncResults.filter(r => r.status === 'failed');

    res.json({
      success: finalFailures.length === 0,
      message: finalFailures.length === 0 ? '重试同步成功' : `重试完成，但仍有 ${finalFailures.length} 条数据失败`,
      results: syncResults
    });

  } catch (error) {
    console.error('重试同步控制器错误:', error);
    res.status(500).json({
      success: false,
      error: '重试同步过程中出现异常: ' + error.message
    });
  }
};

module.exports = {
  syncData,
  retrySync
};
