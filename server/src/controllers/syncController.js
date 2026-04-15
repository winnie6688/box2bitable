const feishuService = require('../services/feishuService');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Sync Controller
 * Handles synchronization of reviewed data to Feishu Bitable.
 */
const syncData = async (req, res) => {
  try {
    const { reviewed_data, task_id, db_task_id } = req.body;

    if (!reviewed_data || !Array.isArray(reviewed_data)) {
      return res.status(400).json({ success: false, error: '无效的复核数据' });
    }

    // 1. Local Aggregation
    const aggregationMap = {};
    reviewed_data.forEach(item => {
      const key = `${item.item_no}|${item.color}|${item.size}`;
      if (aggregationMap[key]) {
        aggregationMap[key].quantity += 1;
      } else {
        aggregationMap[key] = {
          ...item,
          quantity: 1
        };
      }
    });

    const aggregatedList = Object.values(aggregationMap);
    
    // 2. 获取提前上传的飞书 Token (Get pre-uploaded token)
    let feishuFileToken = null;
    if (db_task_id) {
      const { data: imageRecord } = await supabase
        .from('task_images')
        .select('feishu_file_token')
        .eq('task_id', db_task_id)
        .limit(1)
        .single();
      feishuFileToken = imageRecord?.feishu_file_token;
      console.log('从数据库获取到飞书 Token:', feishuFileToken || '未找到');
    }

    // 3. Sync to Feishu (Passing fileToken)
    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken);

    // 4. Persistence: Record sync results to Supabase
    if (db_task_id) {
      const syncRecords = syncResults.map(r => ({
        task_id: db_task_id,
        sku_code: `${r.item.item_no}|${r.item.color}|${r.item.size}`,
        brand: r.item.supplier,
        model: r.item.item_no,
        size: r.item.size,
        color: r.item.color,
        quantity: r.item.quantity,
        bitable_record_id: r.recordId || null,
        status: r.status === 'success' ? 'success' : 'failed',
        error_message: r.error || null,
        sync_data: r.item
      }));

      await supabase.from('sync_records').insert(syncRecords);
    }

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
      const filePath = path.join(__dirname, '../../uploads', task_id);
      if (fs.existsSync(filePath)) {
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
    const { db_task_id, task_id } = req.body;

    if (!db_task_id) {
      return res.status(400).json({ success: false, error: '缺少数据库任务ID' });
    }

    // 1. Fetch failed records from sync_records
    const { data: failedRecords, error: fetchError } = await supabase
      .from('sync_records')
      .select('*')
      .eq('task_id', db_task_id)
      .eq('status', 'failed');

    if (fetchError) throw fetchError;

    if (!failedRecords || failedRecords.length === 0) {
      return res.json({ success: true, message: '没有失败的记录需要重试' });
    }

    // 2. 获取提前上传的飞书 Token (Get pre-uploaded token)
    let feishuFileToken = null;
    const { data: imageRecord } = await supabase
      .from('task_images')
      .select('feishu_file_token')
      .eq('task_id', db_task_id)
      .limit(1)
      .single();
    feishuFileToken = imageRecord?.feishu_file_token;
    console.log('[重试] 获取到飞书 Token:', feishuFileToken || '未找到');

    // 3. Map back to aggregated format for feishuService
    const aggregatedList = failedRecords.map(r => ({
      item_no: r.model,
      color: r.color,
      size: r.size,
      quantity: r.quantity,
      supplier: r.brand
    }));

    // 4. Retry Sync (Use pre-uploaded token if available)
    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken);

    // 5. Update existing records in sync_records
    for (let i = 0; i < syncResults.length; i++) {
      const result = syncResults[i];
      const originalRecord = failedRecords[i];

      await supabase
        .from('sync_records')
        .update({
          status: result.status === 'success' ? 'success' : 'failed',
          bitable_record_id: result.recordId || null,
          error_message: result.error || null,
          sync_time: new Date().toISOString()
        })
        .eq('id', originalRecord.id);
    }

    // 5. Final check and cleanup
    const finalFailures = syncResults.filter(r => r.status === 'failed');
    if (finalFailures.length === 0 && task_id) {
      const filePath = path.join(__dirname, '../../uploads', task_id);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[清理] 重试成功，已删除临时文件: ${task_id}`);
        } catch (e) {
          console.error(`[清理] 重试成功但删除文件失败: ${e.message}`);
        }
      }
    }

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
