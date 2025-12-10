/**
 * CRM tool definitions for OpenAI Function Calling
 */

const getCrmToolDefinitions = () => [
  {
    type: 'function',
    function: {
      name: 'search_customers',
      description: 'Tìm kiếm khách hàng theo tên, số điện thoại, hoặc email. Có thể filter theo gender, province.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm (tên, phone, email). Optional nếu có gender hoặc provinceName.',
          },
          limit: {
            type: 'number',
            description: 'Số lượng kết quả tối đa',
            default: 10,
          },
          gender: {
            type: 'string',
            description: 'Giới tính để filter',
            enum: ['male', 'female', 'other'],
          },
          provinceName: {
            type: 'string',
            description: 'Tên tỉnh/thành để filter',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_by_id',
      description: 'Lấy thông tin khách hàng theo ID',
      parameters: {
        type: 'object',
        properties: {
          customerId: {
            type: 'string',
            description: 'ID của khách hàng',
          },
        },
        required: ['customerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_by_phone',
      description: 'Lấy thông tin khách hàng theo số điện thoại',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Số điện thoại',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_by_email',
      description: 'Lấy thông tin khách hàng theo email',
      parameters: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Email',
          },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: 'Lấy danh sách khách hàng với filter linh hoạt (query, gender, province, phone, email)',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Từ khóa tìm kiếm (tên, phone, email)',
          },
          gender: {
            type: 'string',
            description: 'Giới tính để filter',
            enum: ['male', 'female', 'other'],
          },
          provinceName: {
            type: 'string',
            description: 'Tên tỉnh/thành để filter',
          },
          phone1: {
            type: 'string',
            description: 'Số điện thoại 1 để filter',
          },
          phone2: {
            type: 'string',
            description: 'Số điện thoại 2 để filter',
          },
          email1: {
            type: 'string',
            description: 'Email 1 để filter',
          },
          email2: {
            type: 'string',
            description: 'Email 2 để filter',
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
      name: 'check_customer_exists',
      description: 'Kiểm tra xem khách hàng đã tồn tại chưa (theo phone hoặc email)',
      parameters: {
        type: 'object',
        properties: {
          phone1: {
            type: 'string',
            description: 'Số điện thoại 1',
          },
          phone2: {
            type: 'string',
            description: 'Số điện thoại 2',
          },
          email1: {
            type: 'string',
            description: 'Email 1',
          },
          email2: {
            type: 'string',
            description: 'Email 2',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: 'Tạo khách hàng mới. Nếu đã tồn tại (theo phone/email) thì trả về thông tin khách hàng hiện có.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Tên khách hàng (nếu không có sẽ dùng "Khách hàng")',
          },
          phone1: {
            type: 'string',
            description: 'Số điện thoại 1',
          },
          phone2: {
            type: 'string',
            description: 'Số điện thoại 2',
          },
          email1: {
            type: 'string',
            description: 'Email 1',
          },
          email2: {
            type: 'string',
            description: 'Email 2',
          },
          gender: {
            type: 'string',
            description: 'Giới tính',
            enum: ['male', 'female', 'other'],
          },
          birthday: {
            type: 'string',
            description: 'Ngày sinh (ISO string hoặc YYYY-MM-DD)',
          },
          address: {
            type: 'object',
            description: 'Địa chỉ',
            properties: {
              addressLine: { type: 'string' },
              provinceCode: { type: 'string' },
              provinceName: { type: 'string' },
              wardCode: { type: 'string' },
              wardName: { type: 'string' },
            },
          },
          note: {
            type: 'string',
            description: 'Ghi chú',
          },
        },
      },
    },
  },
];

module.exports = { getCrmToolDefinitions };

