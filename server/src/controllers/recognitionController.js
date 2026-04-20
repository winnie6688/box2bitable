const doubaoService = require('../services/doubaoService');
const { normalizeSize, validateSize, generateSkuCode } = require('../utils/formatter');
const fs = require('fs');
const supabase = require('../utils/supabase');

/**
 * Recognition Controller
 * Handles incoming image uploads and calls the AI service.
 */
const uploadAndRecognize = async (req, res) => {
  let taskId = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未接收到图片文件' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    console.log('开始识别文件:', filePath);

    // 1. 在数据库中创建任务 (Persistence Step 1)
    // 假设目前没有用户系统，先创建一个默认用户或模拟用户
    let { data: user } = await supabase.from('users').select('id').limit(1).single();
    if (!user) {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{ feishu_id: 'default_user', name: '默认管理员' }])
        .select()
        .single();
      if (userError) throw userError;
      user = newUser;
    }

    const { data: task, error: taskError } = await supabase
      .from('recognition_tasks')
      .insert([{ 
        user_id: user.id, 
        status: 'processing',
        total_images: 1 
      }])
      .select()
      .single();
    
    if (taskError) throw taskError;
    taskId = task.id;

    // 2. 记录图片信息 (Persistence Step 2)
    const { data: taskImage, error: imageError } = await supabase
      .from('task_images')
      .insert([{
        task_id: taskId,
        storage_path: filePath,
        filename: fileName,
        file_size: req.file.size
      }])
      .select()
      .single();

    if (imageError) throw imageError;

    // 3. 提前上传图片到飞书并获取 token (Real-time Upload Step)
    const feishuService = require('../services/feishuService');
    let feishuFileToken = null;
    try {
      console.log('正在提前上传图片到飞书...');
      feishuFileToken = await feishuService.uploadAttachment(fileName);
      if (feishuFileToken) {
        await supabase
          .from('task_images')
          .update({ feishu_file_token: feishuFileToken })
          .eq('id', taskImage.id);
        console.log('飞书图片 Token 已持久化:', feishuFileToken);
      }
    } catch (uploadError) {
      console.error('提前上传飞书失败 (不影响识别):', uploadError.message);
    }

    // 4. 调用豆包 AI 服务
    let results = await doubaoService.recognizeLabels(filePath);

    // 4. 格式化数据并持久化结果 (Persistence Step 3)
    const formattedResults = results.map(item => {
      const normalizedSize = normalizeSize(item.size);
      const validation = validateSize(normalizedSize);
      
      const skuCode = generateSkuCode(item.item_no, item.color, normalizedSize);

      if (!item.item_no || !normalizedSize) {
        validation.isAnomaly = true;
        validation.message = '货号或尺码缺失，无法生成有效 SKU';
      }
      
      return {
        task_id: taskId,
        image_id: taskImage.id,
        brand: item.supplier || '',
        model: item.item_no || '',
        size: normalizedSize,
        color: item.color || '',
        sku_code: skuCode,
        confidence: 1.0, // 假设置信度
        raw_data: item,
        is_anomaly: validation.isAnomaly,
        validation_message: validation.message || null
      };
    });

    const { error: resultsError } = await supabase
      .from('recognition_results')
      .insert(formattedResults);

    if (resultsError) throw resultsError;

    // 5. 更新任务状态
    await supabase
      .from('recognition_tasks')
      .update({ status: 'completed', processed_images: 1 })
      .eq('id', taskId);

    console.log('识别并持久化成功:', formattedResults);
    
    res.json({
      success: true,
      task_id: fileName, // 保持与前端逻辑一致，使用文件名作为 task_id 标识物理文件
      db_task_id: taskId,
      results: formattedResults.map(r => ({
        item_no: r.model,
        color: r.color,
        size: r.size,
        supplier: r.brand,
        is_anomaly: r.is_anomaly,
        validation_message: r.validation_message
      }))
    });

  } catch (error) {
    console.error('识别控制器错误:', error);
    
    // 如果任务已创建，更新为失败状态
    if (taskId) {
      await supabase
        .from('recognition_tasks')
        .update({ status: 'failed' })
        .eq('id', taskId);
    }

    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'AI识别或数据保存失败: ' + error.message
    });
  }
};

module.exports = {
  uploadAndRecognize
};
