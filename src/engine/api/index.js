const express = require('express');
const router = express.Router();

// Mount specific route modules
router.use('/auth', require('./routes/auth'));
router.use('/accounts', require('./routes/accounts'));
router.use('/setups', require('./routes/setups'));
router.use('/orders', require('./routes/orders'));
router.use('/users', require('./routes/users'));
router.use('/system', require('./routes/system'));

module.exports = router;
