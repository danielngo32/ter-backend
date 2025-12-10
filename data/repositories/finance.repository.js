const {
  FinanceTransactionModel,
} = require("../schemas/finance.schema");

const createTransaction = (payload) => FinanceTransactionModel.create(payload);

const findTransactionById = (id) => FinanceTransactionModel.findById(id);

const listTransactions = (tenantId, filter = {}, options = {}) => {
  const query = FinanceTransactionModel.find({ tenantId, ...filter });
  if (options.fromDate || options.toDate) {
    query.where("transactionDate");
    if (options.fromDate) query.gte(options.fromDate);
    if (options.toDate) query.lte(options.toDate);
  }
  if (options.limit) query.limit(options.limit);
  if (options.sort) query.sort(options.sort);
  else query.sort({ transactionDate: -1 });
  return query;
};

const updateTransaction = (id, updates) =>
  FinanceTransactionModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true }
  );

const deleteTransaction = (id) =>
  FinanceTransactionModel.findByIdAndDelete(id);

module.exports = {
  createTransaction,
  findTransactionById,
  listTransactions,
  updateTransaction,
  deleteTransaction,
};


