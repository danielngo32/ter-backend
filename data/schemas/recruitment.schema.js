const mongoose = require("mongoose");

const recruitmentAttachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["resume", "portfolio", "certificate", "other"],
      default: "resume",
    },
    url: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const jobSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
    level: {
      type: String,
      enum: ["intern", "junior", "mid", "senior", "lead", "manager"],
      default: "mid",
    },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "internship"],
      default: "full_time",
    },
    openings: { type: Number, default: 1 },
    description: { type: String },
    responsibilities: { type: String },
    requirements: { type: String },
    benefits: { type: String },
    salaryRange: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: "VND", trim: true },
    },
    status: {
      type: String,
      enum: ["draft", "published", "paused", "closed"],
      default: "draft",
    },
    publishedAt: { type: Date },
    closedAt: { type: Date },
    tags: { type: [String], default: [] },
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

jobSchema.index({ tenantId: 1, code: 1 }, { unique: true });
jobSchema.index({ tenantId: 1, status: 1 });

const candidateSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    socialLinks: {
      type: [
        {
          label: { type: String, trim: true },
          url: { type: String, trim: true },
        },
      ],
      default: [],
    },
    currentCompany: { type: String, trim: true },
    currentTitle: { type: String, trim: true },
    experienceYears: { type: Number, default: 0 },
    expectedSalary: { type: Number },
    currency: { type: String, default: "VND", trim: true },
    location: { type: String, trim: true },
    source: {
      type: String,
      enum: ["manual", "referral", "website", "job_board", "agency", "other"],
      default: "manual",
    },
    tags: { type: [String], default: [] },
    note: { type: String, trim: true },
    attachments: { type: [recruitmentAttachmentSchema], default: [] },
    status: {
      type: String,
      enum: ["new", "in_process", "hired", "rejected", "archived"],
      default: "new",
    },
    hiredEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
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

candidateSchema.index({ tenantId: 1, email: 1 });
candidateSchema.index({ tenantId: 1, phone: 1 });

const applicationTimelineSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentJob",
      required: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentCandidate",
      required: true,
    },
    currentStage: {
      type: String,
      enum: [
        "applied",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
      ],
      default: "applied",
    },
    status: {
      type: String,
      enum: ["in_progress", "offered", "declined", "hired", "rejected"],
      default: "in_progress",
    },
    assignedRecruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    appliedAt: { type: Date, default: Date.now },
    source: { type: String, trim: true },
    notes: { type: String, trim: true },
    timeline: { type: [applicationTimelineSchema], default: [] },
  },
  { timestamps: true }
);

applicationSchema.index({ tenantId: 1, jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ tenantId: 1, currentStage: 1 });

const interviewSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentApplication",
      required: true,
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
    location: { type: String, trim: true },
    type: {
      type: String,
      enum: ["online", "onsite", "phone"],
      default: "online",
    },
    panel: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    result: {
      type: String,
      enum: ["pending", "pass", "fail", "on_hold"],
      default: "pending",
    },
    feedback: { type: String, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

interviewSchema.index({ tenantId: 1, applicationId: 1 });

const JobModel = mongoose.model("RecruitmentJob", jobSchema);
const CandidateModel = mongoose.model("RecruitmentCandidate", candidateSchema);
const ApplicationModel = mongoose.model("RecruitmentApplication", applicationSchema);
const InterviewModel = mongoose.model("RecruitmentInterview", interviewSchema);

module.exports = {
  JobModel,
  CandidateModel,
  ApplicationModel,
  InterviewModel,
  jobSchema,
  candidateSchema,
  applicationSchema,
  interviewSchema,
  recruitmentAttachmentSchema,
};

