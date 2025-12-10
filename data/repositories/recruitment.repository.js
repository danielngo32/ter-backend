const {
  JobModel,
  CandidateModel,
  ApplicationModel,
  InterviewModel,
} = require("../schemas/recruitment.schema");

const createJob = (payload) => JobModel.create(payload);

const listJobs = (tenantId, filter = {}, limit = 50) =>
  JobModel.find({ tenantId, ...filter }).limit(limit);

const updateJob = (id, updates) =>
  JobModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const createCandidate = (payload) => CandidateModel.create(payload);

const listCandidates = (tenantId, filter = {}, limit = 50) =>
  CandidateModel.find({ tenantId, ...filter }).limit(limit);

const updateCandidate = (id, updates) =>
  CandidateModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const createApplication = (payload) => ApplicationModel.create(payload);

const listApplications = (tenantId, filter = {}, limit = 50) =>
  ApplicationModel.find({ tenantId, ...filter }).limit(limit);

const updateApplication = (id, updates) =>
  ApplicationModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

const createInterview = (payload) => InterviewModel.create(payload);

const listInterviews = (tenantId, filter = {}, limit = 50) =>
  InterviewModel.find({ tenantId, ...filter }).limit(limit);

const updateInterview = (id, updates) =>
  InterviewModel.findByIdAndUpdate(id, { $set: updates }, { new: true });

module.exports = {
  createJob,
  listJobs,
  updateJob,
  createCandidate,
  listCandidates,
  updateCandidate,
  createApplication,
  listApplications,
  updateApplication,
  createInterview,
  listInterviews,
  updateInterview,
};


