const {
  EmployeeModel,
  AttendanceModel,
  WorkScheduleModel,
  LeaveRequestModel,
  PayrollModel,
  CommissionModel,
} = require("../schemas/hr.schema");

const createEmployee = (payload) => EmployeeModel.create(payload);

const findEmployeeById = (id) => EmployeeModel.findById(id);

const findEmployeeByCode = (tenantId, employeeCode) =>
  EmployeeModel.findOne({ tenantId, employeeCode });

const listEmployees = (tenantId, filter = {}, limit = 50) =>
  EmployeeModel.find({ tenantId, ...filter }).limit(limit);

const updateEmployee = (id, updates) =>
  EmployeeModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const createAttendance = (payload) => AttendanceModel.create(payload);

const upsertAttendance = (tenantId, employeeId, date, updates) =>
  AttendanceModel.findOneAndUpdate(
    { tenantId, employeeId, date },
    { $set: updates },
    { new: true, upsert: true }
  );

const listAttendance = (tenantId, employeeId, fromDate, toDate) => {
  const query = AttendanceModel.find({ tenantId, employeeId });
  if (fromDate || toDate) {
    query.where("date");
    if (fromDate) query.gte(fromDate);
    if (toDate) query.lte(toDate);
  }
  return query.sort({ date: 1 });
};

const createWorkSchedule = (payload) => WorkScheduleModel.create(payload);

const listWorkSchedules = (tenantId, employeeId, fromDate, toDate) => {
  const query = WorkScheduleModel.find({ tenantId, employeeId });
  if (fromDate || toDate) {
    query.where("date");
    if (fromDate) query.gte(fromDate);
    if (toDate) query.lte(toDate);
  }
  return query.sort({ date: 1 });
};

const createLeaveRequest = (payload) => LeaveRequestModel.create(payload);

const listLeaveRequests = (tenantId, employeeId, fromDate, toDate) => {
  const query = LeaveRequestModel.find({ tenantId, employeeId });
  if (fromDate || toDate) {
    query.where("fromDate");
    if (fromDate) query.gte(fromDate);
    if (toDate) query.lte(toDate);
  }
  return query.sort({ fromDate: -1 });
};

const updateLeaveRequestStatus = (id, status, approvedBy, approvedAt) =>
  LeaveRequestModel.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        approvedBy: approvedBy || null,
        approvedAt: approvedAt || new Date(),
      },
    },
    { new: true }
  );

const upsertPayroll = (payload) =>
  PayrollModel.findOneAndUpdate(
    {
      tenantId: payload.tenantId,
      employeeId: payload.employeeId,
      periodYear: payload.periodYear,
      periodMonth: payload.periodMonth,
    },
    { $set: payload },
    { new: true, upsert: true }
  );

const listPayrolls = (tenantId, filter = {}) =>
  PayrollModel.find({ tenantId, ...filter });

const createCommission = (payload) => CommissionModel.create(payload);

const listCommissions = (tenantId, employeeId, filter = {}) =>
  CommissionModel.find({ tenantId, employeeId, ...filter });

module.exports = {
  createEmployee,
  findEmployeeById,
  findEmployeeByCode,
  listEmployees,
  updateEmployee,
  createAttendance,
  upsertAttendance,
  listAttendance,
  createWorkSchedule,
  listWorkSchedules,
  createLeaveRequest,
  listLeaveRequests,
  updateLeaveRequestStatus,
  upsertPayroll,
  listPayrolls,
  createCommission,
  listCommissions,
};


