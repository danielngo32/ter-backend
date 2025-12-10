const mongoose = require("mongoose");

const employeeDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "id_card_front",
        "id_card_back",
        "passport",
        "contract",
        "other",
      ],
      default: "other",
    },
    title: { type: String, trim: true },
    description: { type: String, trim: true },

    url: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },

    issuedDate: { type: Date },
    expiredDate: { type: Date },

    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    employeeCode: { type: String, required: true, trim: true },
    timekeepingCode: { type: String, trim: true },

    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "intern", "contract", "freelance"],
      default: "full_time",
    },
    workMode: {
      type: String,
      enum: ["onsite", "remote", "hybrid"],
      default: "onsite",
    },

    salary: {
      baseAmount: { type: Number, default: 0 },
      currency: { type: String, default: "VND", trim: true },
      payType: {
        type: String,
        enum: ["monthly", "hourly", "per_shift"],
        default: "monthly",
      },
    },

    commissionSettings: {
      enabled: { type: Boolean, default: false },
      ratePercent: { type: Number, default: 0 },
      applyOn: {
        type: String,
        enum: ["revenue", "profit", "custom"],
        default: "revenue",
      },
    },

    idNumber: { type: String, trim: true },
    idIssuedDate: { type: Date },
    idIssuedPlace: { type: String, trim: true },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    position: { type: String, trim: true },
    startWorkingDate: { type: Date },
    endWorkingDate: { type: Date }, 
    status: {
      type: String,
      enum: ["working", "probation", "paused", "resigned"],
      default: "working",
    },

    advanceDebt: { type: Number, default: 0 },
    note: { type: String, trim: true },

    deviceId: { type: String, trim: true },

    workingBranch: { type: String, trim: true },
    payrollBranch: { type: String, trim: true },

    documents: {
      type: [employeeDocumentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

employeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });

const attendanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    shiftName: { type: String, trim: true },
    checkInAt: { type: Date },
    checkOutAt: { type: Date },
    workedMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["present", "late", "absent", "on_leave", "holiday"],
      default: "present",
    },
    source: {
      type: String,
      enum: ["manual", "device", "import"],
      default: "manual",
    },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

attendanceSchema.index(
  { tenantId: 1, employeeId: 1, date: 1 },
  { unique: true }
);

const workScheduleSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    shiftName: { type: String, trim: true },
    startAt: { type: Date },
    endAt: { type: Date },
    status: {
      type: String,
      enum: ["planned", "approved", "cancelled"],
      default: "planned",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

workScheduleSchema.index({ tenantId: 1, employeeId: 1, date: 1 });

const leaveRequestSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["annual", "sick", "unpaid", "other"],
      default: "annual",
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, default: 0 },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ tenantId: 1, employeeId: 1, fromDate: 1 });

const payrollSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    periodYear: { type: Number, required: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    baseSalary: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    allowanceAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    deductionAmount: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "confirmed", "paid"],
      default: "draft",
    },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

payrollSchema.index(
  { tenantId: 1, employeeId: 1, periodYear: 1, periodMonth: 1 },
  { unique: true }
);

const commissionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["sale", "other"],
      default: "sale",
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    amount: { type: Number, required: true, default: 0 },
    ratePercent: { type: Number, default: 0 },
    periodYear: { type: Number, required: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

commissionSchema.index({
  tenantId: 1,
  employeeId: 1,
  periodYear: 1,
  periodMonth: 1,
});

const EmployeeModel = mongoose.model("Employee", employeeSchema);
const AttendanceModel = mongoose.model("EmployeeAttendance", attendanceSchema);
const WorkScheduleModel = mongoose.model(
  "EmployeeWorkSchedule",
  workScheduleSchema
);
const LeaveRequestModel = mongoose.model(
  "EmployeeLeaveRequest",
  leaveRequestSchema
);
const PayrollModel = mongoose.model("EmployeePayroll", payrollSchema);
const CommissionModel = mongoose.model(
  "EmployeeCommission",
  commissionSchema
);

module.exports = {
  EmployeeModel,
  employeeSchema,
  employeeDocumentSchema,
  AttendanceModel,
  attendanceSchema,
  WorkScheduleModel,
  workScheduleSchema,
  LeaveRequestModel,
  leaveRequestSchema,
  PayrollModel,
  payrollSchema,
  CommissionModel,
  commissionSchema,
};
