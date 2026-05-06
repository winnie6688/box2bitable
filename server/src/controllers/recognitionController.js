const doubaoService = require('../services/doubaoService');
const { normalizeSize, validateSize, generateSkuCode } = require('../utils/formatter');
const fs = require('fs');
const { getSupabase } = require('../utils/supabase');
const { normalizeModule } = require('../config/modules');
const path = require('path');
const { uploadDir } = require('../utils/upload');
const axios = require('axios');

const mimeToExt = (mime) => {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return null;
  }
};

const parseBase64Image = (input) => {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  const buf = Buffer.from(b64, 'base64');
  if (!buf || buf.length === 0) return null;
  return { mime, buffer: buf };
};

const isPrivateHostname = (hostname) => {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
};

const downloadImageToFile = async (url, dstPath) => {
  const u = new URL(String(url || '').trim());
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('image_url must be http(s)');
  }
  if (isPrivateHostname(u.hostname)) {
    throw new Error('image_url hostname is not allowed');
  }

  const resp = await axios.get(u.toString(), {
    responseType: 'arraybuffer',
    timeout: Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 15_000),
    maxContentLength: 10 * 1024 * 1024,
    maxBodyLength: 10 * 1024 * 1024,
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const ct = String(resp.headers && resp.headers['content-type'] ? resp.headers['content-type'] : '').toLowerCase();
  if (!ct.startsWith('image/')) {
    throw new Error(`image_url content-type is not image: ${ct || 'unknown'}`);
  }
  const buf = Buffer.from(resp.data);
  if (!buf || buf.length === 0) throw new Error('image_url download empty');
  if (buf.length > 10 * 1024 * 1024) throw new Error('图片过大（最大 10MB）');
  fs.writeFileSync(dstPath, buf);
  return { mime: ct.split(';')[0], size: buf.length };
};

/**
 * Recognition Controller
 * Handles incoming image uploads and calls the AI service.
 */
const uploadAndRecognize = async (req, res) => {
  let taskId = null;
  let supabase = null;
  try {
    supabase = getSupabase();
    if (!req.file) {
      const parsed = parseBase64Image(
        req.body?.image_base64 ?? req.body?.imageBase64 ?? req.body?.image
      );
      if (parsed) {
        const ext = mimeToExt(parsed.mime);
        if (!ext) {
          return res.status(400).json({ success: false, error: '不支持的文件类型' });
        }
        if (parsed.buffer.length > 10 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: '图片过大（最大 10MB）' });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileName = `image-${uniqueSuffix}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, parsed.buffer);

        req.file = {
          path: filePath,
          filename: fileName,
          size: parsed.buffer.length,
        };
      } else {
        const imageUrl = req.body?.image_url ?? req.body?.imageUrl;
        if (!imageUrl) {
          return res.status(400).json({ success: false, error: '未接收到图片文件' });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileName = `image-${uniqueSuffix}.jpg`;
        const filePath = path.join(uploadDir, fileName);
        const info = await downloadImageToFile(imageUrl, filePath);

        req.file = {
          path: filePath,
          filename: fileName,
          size: info.size,
        };
      }
    }

    const module = normalizeModule(req.body?.module);
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
      const target = feishuService._getBitableTarget(module);
      feishuFileToken = await feishuService.uploadAttachment(fileName, target.appToken);
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
    let results = await doubaoService.recognizeLabels(filePath, module);

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

    console.log('识别并持久化成功:', { taskId, count: formattedResults.length, module });
    
    res.json({
      success: true,
      task_id: fileName, // 保持与前端逻辑一致，使用文件名作为 task_id 标识物理文件
      db_task_id: taskId,
      module,
      results: formattedResults.map(r => ({
        item_no: r.model,
        color: r.color,
        size: r.size,
        supplier: r.brand,
        sku_code: r.sku_code,
        is_anomaly: r.is_anomaly,
        validation_message: r.validation_message
      }))
    });

  } catch (error) {
    console.error('识别控制器错误:', error);
    
    // 如果任务已创建，更新为失败状态
    if (taskId && supabase) {
      try {
        await supabase
          .from('recognition_tasks')
          .update({ status: 'failed' })
          .eq('id', taskId);
      } catch (e) {
        console.error('更新任务失败状态出错:', e && e.message ? e.message : e);
      }
    }

    // 清理临时文件
    try {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {
      console.error('清理临时文件失败:', e && e.message ? e.message : e);
    }

    const rawMsg = error && error.message ? String(error.message) : String(error || '');
    const m = rawMsg.match(/ENOTFOUND\s+([a-z0-9.-]+\.supabase\.co)/i);
    if (m) {
      return res.status(503).json({
        success: false,
        error: `Supabase 域名解析失败（ENOTFOUND: ${m[1]}）。请检查云托管环境变量 SUPABASE_URL 是否为正确的 https://<project-ref>.supabase.co，并确认云托管网络可访问 supabase.co`,
      });
    }

    res.status(500).json({
      success: false,
      error: 'AI识别或数据保存失败: ' + rawMsg
    });
  }
};

module.exports = {
  uploadAndRecognize
};
