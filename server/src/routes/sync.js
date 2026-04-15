const express = require('express');
const router = express.Router();

const syncController = require('../controllers/syncController');

// 同步复核后的数据到飞书
router.post('/', syncController.syncData);

// 重试失败的同步记录
router.post('/retry', syncController.retrySync);

module.exports = router;
