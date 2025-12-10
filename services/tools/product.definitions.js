const getProductToolDefinitions = () => [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Tìm kiếm sản phẩm theo tên, SKU, hoặc barcode. Có thể filter theo category, brand.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm (tên, SKU, barcode). Optional nếu có categoryId hoặc brandId.',
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 10,
          },
          categoryId: {
            type: 'string',
            description: 'ID của category để filter',
          },
          brandId: {
            type: 'string',
            description: 'ID của brand để filter',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_by_barcode',
      description: 'Lấy thông tin sản phẩm theo barcode (có thể là base product hoặc variant)',
      parameters: {
        type: 'object',
        properties: {
          barcode: {
            type: 'string',
            description: 'Mã vạch của sản phẩm',
          },
        },
        required: ['barcode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_by_id',
      description: 'Lấy thông tin sản phẩm theo ID. Có thể chỉ định variantId nếu sản phẩm có variants.',
      parameters: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'ID của sản phẩm',
          },
          variantId: {
            type: 'string',
            description: 'ID của variant (nếu sản phẩm có variants)',
          },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_by_sku',
      description: 'Lấy thông tin sản phẩm theo SKU',
      parameters: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'SKU của sản phẩm',
          },
        },
        required: ['sku'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_product_stock',
      description: 'Kiểm tra tồn kho của sản phẩm. Có thể chỉ định variantId và số lượng cần kiểm tra.',
      parameters: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'ID của sản phẩm',
          },
          variantId: {
            type: 'string',
            description: 'ID của variant (nếu sản phẩm có variants)',
          },
          quantity: {
            type: 'number',
            description: 'Số lượng cần kiểm tra',
            default: 1,
          },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Lấy danh sách tất cả categories',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_brands',
      description: 'Lấy danh sách tất cả brands',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_promotions',
      description: 'Lấy danh sách promotions đang active. Có thể filter theo productId, categoryId, brandId.',
      parameters: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'ID của sản phẩm để filter promotions',
          },
          categoryId: {
            type: 'string',
            description: 'ID của category để filter promotions',
          },
          brandId: {
            type: 'string',
            description: 'ID của brand để filter promotions',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products_by_category',
      description: 'Lấy danh sách tất cả sản phẩm trong một category',
      parameters: {
        type: 'object',
        properties: {
          categoryId: {
            type: 'string',
            description: 'ID của category',
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
          status: {
            type: 'string',
            description: 'Status của sản phẩm để filter',
            enum: ['active', 'inactive', 'draft'],
          },
        },
        required: ['categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products_by_brand',
      description: 'Lấy danh sách tất cả sản phẩm của một brand',
      parameters: {
        type: 'object',
        properties: {
          brandId: {
            type: 'string',
            description: 'ID của brand',
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
          status: {
            type: 'string',
            description: 'Status của sản phẩm để filter',
            enum: ['active', 'inactive', 'draft'],
          },
        },
        required: ['brandId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'Lấy danh sách sản phẩm với filter linh hoạt (category, brand, status, price range, stock status, variants)',
      parameters: {
        type: 'object',
        properties: {
          categoryId: {
            type: 'string',
            description: 'ID của category để filter',
          },
          brandId: {
            type: 'string',
            description: 'ID của brand để filter',
          },
          status: {
            type: 'string',
            description: 'Status của sản phẩm',
            enum: ['active', 'inactive', 'draft'],
          },
          minPrice: {
            type: 'number',
            description: 'Giá tối thiểu',
          },
          maxPrice: {
            type: 'number',
            description: 'Giá tối đa',
          },
          inStock: {
            type: 'boolean',
            description: 'Chỉ lấy sản phẩm còn hàng',
          },
          hasVariants: {
            type: 'boolean',
            description: 'Chỉ lấy sản phẩm có variants hoặc không có variants',
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
      name: 'find_category_by_name',
      description: 'Tìm category theo tên (case-insensitive)',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Tên của category',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_brand_by_name',
      description: 'Tìm brand theo tên (case-insensitive)',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Tên của brand',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_product_variant_by_attributes',
      description: 'Tìm variant của sản phẩm dựa trên attributes (ví dụ: size L, màu đỏ). Sử dụng khi sản phẩm có variants và người dùng đề cập đến thuộc tính cụ thể.',
      parameters: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'ID của sản phẩm',
          },
          attributeValues: {
            type: 'array',
            description: 'Danh sách attribute values để tìm variant (ví dụ: [{attribute: "size", value: "L"}, {attribute: "color", value: "đỏ"}])',
            items: {
              type: 'object',
              properties: {
                attribute: {
                  type: 'string',
                  description: 'Tên attribute (ví dụ: "size", "color", "màu sắc", "kích thước")',
                },
                value: {
                  type: 'string',
                  description: 'Giá trị attribute (ví dụ: "L", "đỏ", "red", "large")',
                },
              },
            },
          },
        },
        required: ['productId', 'attributeValues'],
      },
    },
  },
];

module.exports = { getProductToolDefinitions };

