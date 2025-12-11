const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { validateCreateOrder, validateUpdateOrder, validateListOrdersQuery } = require('../validators/order.validator');
const authHelper = require('../utils/authHelper');
const ApiError = require('../utils/apiError');

// Simple auth middleware similar to product.controller usage
const requireAuth = (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);
    if (!token) throw new ApiError(401, 'Authorization token missing');
    const userId = authHelper.getCurrentUserId(token);
    const userTenant = authHelper.getCurrentTenantId ? authHelper.getCurrentTenantId(token) : null;
    req.userId = userId;
    req.tenantId = userTenant;
    req.user = { _id: userId, tenantId: userTenant };
    next();
  } catch (err) {
    next(err);
  }
};

// Routes
router.post('/', requireAuth, validateCreateOrder, orderController.createOrder);
router.get('/', requireAuth, validateListOrdersQuery, orderController.listOrders);
router.get('/by-number/:orderNumber', requireAuth, orderController.getOrderByNumber);
router.get('/customer/:customerId', requireAuth, orderController.getOrdersByCustomer);
router.get('/status/:status', requireAuth, orderController.getOrdersByStatus);
router.get('/unpaid', requireAuth, orderController.getUnpaidOrders);
router.get('/unfulfilled', requireAuth, orderController.getUnfulfilledOrders);
router.get('/stats', requireAuth, orderController.getOrderStatistics);
router.get('/:id', requireAuth, orderController.getOrderById);
router.patch('/:id', requireAuth, validateUpdateOrder, orderController.updateOrder);
router.delete('/:id', requireAuth, orderController.deleteOrder);

module.exports = router;

