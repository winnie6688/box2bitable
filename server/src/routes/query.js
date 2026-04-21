const express = require('express');
const router = express.Router();

const queryController = require('../controllers/queryController');

router.get('/inventory', queryController.queryInventory);

module.exports = router;

