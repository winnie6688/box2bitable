const express = require('express');
const router = express.Router();

const recognitionController = require('../controllers/recognitionController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// 上传图片并识别
router.post('/upload', upload.single('image'), recognitionController.uploadAndRecognize);

// 获取识别结果 (P4 阶段接入数据库后完善)
router.get('/results/:task_id', (req, res) => {
  res.json({ message: 'Get results placeholder (DB integration needed)' });
});

module.exports = router;
