const express = require('express');
const router = express.Router();

const recognitionController = require('../controllers/recognitionController');
const { upload } = require('../utils/upload');

// 上传图片并识别
router.post(
  '/upload',
  (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.startsWith('multipart/form-data')) {
      return upload.single('image')(req, res, next);
    }
    next();
  },
  recognitionController.uploadAndRecognize
);

// 获取识别结果 (P4 阶段接入数据库后完善)
router.get('/results/:task_id', (req, res) => {
  res.json({ message: 'Get results placeholder (DB integration needed)' });
});

module.exports = router;
