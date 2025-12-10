
const getOrderToolDefinitions = () => [
  {
    type: 'function',
    function: {
      name: 'calculate_order_total',
      description: 'Tính tổng tiền đơn hàng từ danh sách items. Hỗ trợ tìm product theo barcode, productId, hoặc manual items (quickSale).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Danh sách items. Mỗi item có thể có: barcode, productId+variantId, hoặc name+unitPrice (manual)',
            items: {
              type: 'object',
              properties: {
                barcode: {
                  type: 'string',
                  description: 'Mã vạch của sản phẩm (để tự động tìm product)',
                },
                productId: {
                  type: 'string',
                  description: 'ID của sản phẩm',
                },
                variantId: {
                  type: 'string',
                  description: 'ID của variant (nếu sản phẩm có variants)',
                },
                name: {
                  type: 'string',
                  description: 'Tên sản phẩm (cho manual items)',
                },
                sku: {
                  type: 'string',
                  description: 'SKU (cho manual items)',
                },
                unitPrice: {
                  type: 'number',
                  description: 'Giá đơn vị (cho manual items hoặc override)',
                },
                quantity: {
                  type: 'number',
                  description: 'Số lượng',
                  default: 1,
                },
              },
            },
          },
          discountTotal: {
            type: 'number',
            description: 'Tổng giảm giá',
            default: 0,
          },
          taxTotal: {
            type: 'number',
            description: 'Tổng thuế',
            default: 0,
          },
          shippingFee: {
            type: 'number',
            description: 'Phí vận chuyển',
            default: 0,
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_by_id',
      description: 'Lấy thông tin đơn hàng theo ID',
      parameters: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'ID của đơn hàng',
          },
        },
        required: ['orderId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_by_order_number',
      description: 'Lấy thông tin đơn hàng theo order number',
      parameters: {
        type: 'object',
        properties: {
          orderNumber: {
            type: 'string',
            description: 'Số đơn hàng',
          },
        },
        required: ['orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_orders',
      description: 'Tìm kiếm đơn hàng theo orderNumber, item name, SKU, hoặc notes. Có thể filter theo status, paymentStatus, orderType.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm (orderNumber, item name, SKU, notes)',
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 10,
          },
          status: {
            type: 'string',
            description: 'Status của đơn hàng',
            enum: ['draft', 'confirmed', 'fulfilled', 'cancelled'],
          },
          paymentStatus: {
            type: 'string',
            description: 'Payment status của đơn hàng',
            enum: ['unpaid', 'partial', 'paid', 'refunded'],
          },
          orderType: {
            type: 'string',
            description: 'Loại đơn hàng',
            enum: ['normal', 'shipping'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_orders',
      description: 'Lấy danh sách đơn hàng với filter linh hoạt (status, paymentStatus, customer, date range, total range, etc.)',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Status của đơn hàng',
            enum: ['draft', 'confirmed', 'fulfilled', 'cancelled'],
          },
          paymentStatus: {
            type: 'string',
            description: 'Payment status',
            enum: ['unpaid', 'partial', 'paid', 'refunded'],
          },
          fulfillmentStatus: {
            type: 'string',
            description: 'Fulfillment status',
            enum: ['unfulfilled', 'partial', 'fulfilled'],
          },
          orderType: {
            type: 'string',
            description: 'Loại đơn hàng',
            enum: ['normal', 'shipping'],
          },
          customerId: {
            type: 'string',
            description: 'ID của khách hàng',
          },
          salesPersonId: {
            type: 'string',
            description: 'ID của nhân viên bán hàng',
          },
          quickSale: {
            type: 'boolean',
            description: 'Chỉ lấy quickSale orders',
          },
          allowDebt: {
            type: 'boolean',
            description: 'Chỉ lấy orders cho phép nợ',
          },
          minTotal: {
            type: 'number',
            description: 'Tổng tiền tối thiểu',
          },
          maxTotal: {
            type: 'number',
            description: 'Tổng tiền tối đa',
          },
          startDate: {
            type: 'string',
            description: 'Ngày bắt đầu (ISO string hoặc YYYY-MM-DD)',
          },
          endDate: {
            type: 'string',
            description: 'Ngày kết thúc (ISO string hoặc YYYY-MM-DD)',
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 50,
          },
          skip: {
            type: 'number',
            description: 'Số lượng bỏ qua',
            default: 0,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders_by_customer',
      description: 'Lấy danh sách đơn hàng của một khách hàng',
      parameters: {
        type: 'object',
        properties: {
          customerId: {
            type: 'string',
            description: 'ID của khách hàng',
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 50,
          },
          skip: {
            type: 'number',
            description: 'Số lượng bỏ qua',
            default: 0,
          },
        },
        required: ['customerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders_by_status',
      description: 'Lấy danh sách đơn hàng theo status',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Status của đơn hàng',
            enum: ['draft', 'confirmed', 'fulfilled', 'cancelled'],
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 50,
          },
          skip: {
            type: 'number',
            description: 'Số lượng bỏ qua',
            default: 0,
          },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unpaid_orders',
      description: 'Lấy danh sách đơn hàng chưa thanh toán (unpaid hoặc partial)',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 50,
          },
          skip: {
            type: 'number',
            description: 'Số lượng bỏ qua',
            default: 0,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unfulfilled_orders',
      description: 'Lấy danh sách đơn hàng chưa fulfill (unfulfilled hoặc partial)',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 50,
          },
          skip: {
            type: 'number',
            description: 'Số lượng bỏ qua',
            default: 0,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_statistics',
      description: 'Lấy thống kê đơn hàng (tổng số đơn, doanh thu, breakdown theo status, paymentStatus)',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Ngày bắt đầu (ISO string hoặc YYYY-MM-DD)',
          },
          endDate: {
            type: 'string',
            description: 'Ngày kết thúc (ISO string hoặc YYYY-MM-DD)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: 'Tạo đơn hàng mới. Hỗ trợ tìm hoặc tạo khách hàng tự động. Hỗ trợ sản phẩm không có trong hệ thống (quickSale).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Danh sách items. Mỗi item có thể có: barcode, productId+variantId, hoặc name+unitPrice (manual)',
            items: {
              type: 'object',
              properties: {
                barcode: {
                  type: 'string',
                  description: 'Mã vạch của sản phẩm (để tự động tìm product)',
                },
                productId: {
                  type: 'string',
                  description: 'ID của sản phẩm',
                },
                variantId: {
                  type: 'string',
                  description: 'ID của variant (nếu sản phẩm có variants)',
                },
                name: {
                  type: 'string',
                  description: 'Tên sản phẩm (bắt buộc cho manual items)',
                },
                sku: {
                  type: 'string',
                  description: 'SKU (cho manual items)',
                },
                unitPrice: {
                  type: 'number',
                  description: 'Giá đơn vị (bắt buộc cho manual items)',
                },
                quantity: {
                  type: 'number',
                  description: 'Số lượng',
                  default: 1,
                },
              },
            },
          },
          customerId: {
            type: 'string',
            description: 'ID của khách hàng (nếu đã biết)',
          },
          customerName: {
            type: 'string',
            description: 'Tên khách hàng (để tìm hoặc tạo mới)',
          },
          customerPhone: {
            type: 'string',
            description: 'Số điện thoại khách hàng (để tìm hoặc tạo mới)',
          },
          customerEmail: {
            type: 'string',
            description: 'Email khách hàng (để tìm hoặc tạo mới)',
          },
          customerGender: {
            type: 'string',
            description: 'Giới tính khách hàng (male, female, hoặc để trống nếu không xác định)',
            enum: ['male', 'female'],
          },
          orderType: {
            type: 'string',
            description: 'Loại đơn hàng',
            enum: ['normal', 'shipping'],
            default: 'normal',
          },
          status: {
            type: 'string',
            description: 'Status của đơn hàng',
            enum: ['draft', 'confirmed', 'fulfilled', 'cancelled'],
            default: 'confirmed',
          },
          notes: {
            type: 'string',
            description: 'Ghi chú cho đơn hàng',
          },
          discountTotal: {
            type: 'number',
            description: 'Tổng giảm giá',
            default: 0,
          },
          taxTotal: {
            type: 'number',
            description: 'Tổng thuế',
            default: 0,
          },
          shippingFee: {
            type: 'number',
            description: 'Phí vận chuyển',
            default: 0,
          },
          allowDebt: {
            type: 'boolean',
            description: 'Cho phép nợ',
            default: false,
          },
          salesPersonId: {
            type: 'string',
            description: 'ID của nhân viên bán hàng',
          },
          payments: {
            type: 'array',
            description: 'Danh sách thanh toán (có thể để trống nếu chỉ tạo đơn để quản lý tồn kho)',
            items: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  description: 'Phương thức thanh toán',
                  enum: ['cash', 'bank_transfer', 'card', 'qr_code', 'other'],
                },
                amount: {
                  type: 'number',
                  description: 'Số tiền thanh toán',
                },
                partnerId: {
                  type: 'string',
                  description: 'ID của đối tác thanh toán (nếu có)',
                },
                referenceCode: {
                  type: 'string',
                  description: 'Mã tham chiếu (ví dụ: mã giao dịch chuyển khoản)',
                },
                note: {
                  type: 'string',
                  description: 'Ghi chú thanh toán',
                },
              },
            },
          },
          shippingAddress: {
            type: 'object',
            description: 'Địa chỉ giao hàng (nếu có sẽ tự động set orderType = "shipping")',
            properties: {
              addressLine: { type: 'string' },
              provinceName: { type: 'string' },
              wardName: { type: 'string' },
              recipientName: { type: 'string' },
              recipientPhone: { type: 'string' },
            },
          },
          shippingPartnerId: {
            type: 'string',
            description: 'ID của đối tác vận chuyển',
          },
          shippingNote: {
            type: 'string',
            description: 'Ghi chú giao hàng',
          },
          estimatedDeliveryDate: {
            type: 'string',
            description: 'Ngày dự kiến giao hàng (ISO string hoặc YYYY-MM-DD)',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_payment_change',
      description: 'Tính toán tiền thừa/thối lại và số tiền còn thiếu dựa trên tổng hóa đơn và các khoản thanh toán. Sử dụng khi cần tính toán thanh toán trước khi tạo đơn hàng.',
      parameters: {
        type: 'object',
        properties: {
          grandTotal: {
            type: 'number',
            description: 'Tổng tiền hóa đơn',
          },
          payments: {
            type: 'array',
            description: 'Danh sách thanh toán',
            items: {
              type: 'object',
              properties: {
                method: {
                  type: 'string',
                  description: 'Phương thức thanh toán',
                  enum: ['cash', 'bank_transfer', 'card', 'qr_code', 'other'],
                },
                amount: {
                  type: 'number',
                  description: 'Số tiền thanh toán',
                },
              },
            },
          },
        },
        required: ['grandTotal'],
      },
    },
  },
];

module.exports = { getOrderToolDefinitions };

