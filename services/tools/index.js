const { getProductToolDefinitions } = require('./product.definitions');
const { getCrmToolDefinitions } = require('./crm.definitions');
const { getOrderToolDefinitions } = require('./order.definitions');
const productTools = require('./handlers/product.tools');
const crmTools = require('./handlers/crm.tools');
const orderTools = require('./handlers/order.tools');

const getToolDefinitions = () => {
  return [
    ...getProductToolDefinitions(),
    ...getCrmToolDefinitions(),
    ...getOrderToolDefinitions(),
  ];
};

// Map tool names to handlers
const TOOL_HANDLERS = {
  // Product tools
  search_products: productTools.searchProducts,
  get_product_by_barcode: productTools.getProductByBarcode,
  get_product_by_id: productTools.getProductById,
  get_product_by_sku: productTools.getProductBySku,
  check_product_stock: productTools.checkProductStock,
  get_categories: productTools.getCategories,
  get_brands: productTools.getBrands,
  get_active_promotions: productTools.getActivePromotions,
  list_products_by_category: productTools.listProductsByCategory,
  list_products_by_brand: productTools.listProductsByBrand,
  list_products: productTools.listProducts,
  find_category_by_name: productTools.findCategoryByName,
  find_brand_by_name: productTools.findBrandByName,
  find_product_variant_by_attributes: productTools.findProductVariantByAttributes,

  // CRM tools
  search_customers: crmTools.searchCustomers,
  get_customer_by_id: crmTools.getCustomerById,
  get_customer_by_phone: crmTools.getCustomerByPhone,
  get_customer_by_email: crmTools.getCustomerByEmail,
  list_customers: crmTools.listCustomers,
  check_customer_exists: crmTools.checkCustomerExists,

  // Order tools
  calculate_order_total: orderTools.calculateOrderTotal,
  get_order_by_id: orderTools.getOrderById,
  get_order_by_order_number: orderTools.getOrderByOrderNumber,
  search_orders: orderTools.searchOrders,
  list_orders: orderTools.listOrders,
  get_orders_by_customer: orderTools.getOrdersByCustomer,
  get_orders_by_status: orderTools.getOrdersByStatus,
  get_unpaid_orders: orderTools.getUnpaidOrders,
  get_unfulfilled_orders: orderTools.getUnfulfilledOrders,
  get_order_statistics: orderTools.getOrderStatistics,
  create_order: orderTools.createOrder,
  calculate_payment_change: orderTools.calculatePaymentChange,

  // CRM tools
  create_customer: crmTools.createCustomer,
};

// Execute tool calls from GPT
const executeTool = async (toolCalls, context) => {
  const results = [];

  for (const toolCall of toolCalls) {
    const { id, function: func } = toolCall;
    const { name, arguments: argsStr } = func;

    try {
      const args = JSON.parse(argsStr);
      const handler = TOOL_HANDLERS[name];

      if (!handler) {
        results.push({
          tool_call_id: id,
          role: 'tool',
          name,
          content: JSON.stringify({ error: `Unknown tool: ${name}` }),
        });
        continue;
      }

      const result = await handler(args, context);

      results.push({
        tool_call_id: id,
        role: 'tool',
        name,
        content: JSON.stringify(result),
      });
    } catch (error) {
      results.push({
        tool_call_id: id,
        role: 'tool',
        name,
        content: JSON.stringify({
          error: error.message || 'Tool execution failed',
          details: error.stack,
        }),
      });
    }
  }

  return results;
};

module.exports = {
  getToolDefinitions,
  executeTool,
  productTools,
  crmTools,
  orderTools,
};

