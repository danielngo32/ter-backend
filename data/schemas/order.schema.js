const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: true }
);

orderItemSchema.virtual('lineTotal').get(function() {
  return this.quantity * this.unitPrice;
});

orderItemSchema.set('toJSON', { virtuals: true });
orderItemSchema.set('toObject', { virtuals: true });

const orderPaymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "card", "qr_code", "other"],
      required: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentPartner",
      default: null,
    },
    amount: { type: Number, required: true, min: 0 },
    referenceCode: { type: String, trim: true },
    note: { type: String, trim: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const orderTotalsSchema = new mongoose.Schema(
  {
    subTotal: { type: Number, default: 0, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    paidTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

orderTotalsSchema.virtual('changeAmount').get(function() {
  return Math.max(0, this.paidTotal - this.grandTotal);
});

orderTotalsSchema.virtual('outstandingBalance').get(function() {
  return Math.max(0, this.grandTotal - this.paidTotal);
});

orderTotalsSchema.set('toJSON', { virtuals: true });
orderTotalsSchema.set('toObject', { virtuals: true });

const orderShippingAddressSchema = new mongoose.Schema(
  {
    addressLine: { type: String, trim: true },
    provinceName: { type: String, trim: true },
    wardName: { type: String, trim: true },
    recipientName: { type: String, trim: true },
    recipientPhone: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, trim: true },
    orderType: {
      type: String,
      enum: ["normal", "shipping"],
      default: "normal",
    },
    status: {
      type: String,
      enum: ["draft", "confirmed", "fulfilled", "cancelled"],
      default: "confirmed",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "refunded"],
      default: "unpaid",
    },
    fulfillmentStatus: {
      type: String,
      enum: ["unfulfilled", "partial", "fulfilled"],
      default: "unfulfilled",
    },
    quickSale: { type: Boolean, default: false },
    notes: { type: String, trim: true },

    salesPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    items: { type: [orderItemSchema], default: [] },
    totals: { type: orderTotalsSchema, default: () => ({}) },
    payments: { type: [orderPaymentSchema], default: [] },

    shipping: {
      partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ShippingPartner",
        default: null,
      },
      address: {
        type: orderShippingAddressSchema,
        default: null,
      },
      trackingNumber: { type: String, trim: true },
      estimatedDeliveryDate: { type: Date },
      note: { type: String, trim: true },
    },

    dueDate: { type: Date },
    allowDebt: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ tenantId: 1, paymentStatus: 1 });
orderSchema.index({ tenantId: 1, customerId: 1 });
orderSchema.index({ tenantId: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, orderType: 1 });
orderSchema.index({ tenantId: 1, status: 1 });
orderSchema.index({ "shipping.partnerId": 1 });

const OrderModel = mongoose.model("Order", orderSchema);

module.exports = {
  OrderModel,
  orderSchema,
  orderItemSchema,
  orderPaymentSchema,
  orderTotalsSchema,
  orderShippingAddressSchema,
};
