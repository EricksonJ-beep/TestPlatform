/**
 * Row types inferred from the Drizzle schema. `SelectX` is what a query returns,
 * `InsertX` is what an insert accepts (defaults optional).
 */
import type * as s from "./schema";

type Select<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

// Enums
export type UserRole = (typeof s.userRole.enumValues)[number];
export type AssessmentType = (typeof s.assessmentType.enumValues)[number];
export type ReviewMode = (typeof s.reviewMode.enumValues)[number];
export type QuestionType = (typeof s.questionType.enumValues)[number];
export type GradingMode = (typeof s.gradingMode.enumValues)[number];
export type BloomLevel = (typeof s.bloomLevel.enumValues)[number];
export type AttemptStatus = (typeof s.attemptStatus.enumValues)[number];
export type CorrectionStatus = (typeof s.correctionStatus.enumValues)[number];
export type SharePermission = (typeof s.sharePermission.enumValues)[number];
export type ShareResourceType = (typeof s.shareResourceType.enumValues)[number];
export type StimulusKind = (typeof s.stimulusKind.enumValues)[number];
export type MediaKind = (typeof s.mediaKind.enumValues)[number];
export type ActivityKind = (typeof s.activityKind.enumValues)[number];
export type WorksheetCountsAs = (typeof s.worksheetCountsAs.enumValues)[number];
export type WorksheetEventType = (typeof s.worksheetEventType.enumValues)[number];

// Identity & orgs
export type SelectOrganization = Select<typeof s.organizations>;
export type InsertOrganization = Insert<typeof s.organizations>;
export type SelectUser = Select<typeof s.users>;
export type InsertUser = Insert<typeof s.users>;
/** A user row with the password hash stripped — the only shape that leaves the server. */
export type PublicUser = Omit<SelectUser, "passwordHash">;
export type SelectCourse = Select<typeof s.courses>;
export type InsertCourse = Insert<typeof s.courses>;
export type SelectUnit = Select<typeof s.units>;
export type InsertUnit = Insert<typeof s.units>;
export type SelectClass = Select<typeof s.classes>;
export type InsertClass = Insert<typeof s.classes>;
export type SelectEnrollment = Select<typeof s.enrollments>;
export type InsertEnrollment = Insert<typeof s.enrollments>;

// Standards
export type SelectLearningTarget = Select<typeof s.learningTargets>;
export type InsertLearningTarget = Insert<typeof s.learningTargets>;
export type SelectStandard = Select<typeof s.standards>;
export type InsertStandard = Insert<typeof s.standards>;

// Content
export type SelectMediaAsset = Select<typeof s.mediaAssets>;
export type InsertMediaAsset = Insert<typeof s.mediaAssets>;
export type SelectQuestionBank = Select<typeof s.questionBanks>;
export type InsertQuestionBank = Insert<typeof s.questionBanks>;
export type SelectStimulus = Select<typeof s.stimuli>;
export type InsertStimulus = Insert<typeof s.stimuli>;
export type SelectQuestionTemplate = Select<typeof s.questionTemplates>;
export type InsertQuestionTemplate = Insert<typeof s.questionTemplates>;
export type SelectQuestion = Select<typeof s.questions>;
export type InsertQuestion = Insert<typeof s.questions>;
export type SelectQuestionOption = Select<typeof s.questionOptions>;
export type InsertQuestionOption = Insert<typeof s.questionOptions>;
export type SelectQuestionTarget = Select<typeof s.questionTargets>;
export type InsertQuestionTarget = Insert<typeof s.questionTargets>;
export type SelectQuestionStandard = Select<typeof s.questionStandards>;
export type InsertQuestionStandard = Insert<typeof s.questionStandards>;
export type SelectQuestionPool = Select<typeof s.questionPools>;
export type InsertQuestionPool = Insert<typeof s.questionPools>;
export type SelectPoolQuestion = Select<typeof s.poolQuestions>;
export type InsertPoolQuestion = Insert<typeof s.poolQuestions>;
export type SelectPoolTarget = Select<typeof s.poolTargets>;
export type InsertPoolTarget = Insert<typeof s.poolTargets>;

// Assessments
export type SelectAssessment = Select<typeof s.assessments>;
export type InsertAssessment = Insert<typeof s.assessments>;
export type SelectAssessmentSection = Select<typeof s.assessmentSections>;
export type InsertAssessmentSection = Insert<typeof s.assessmentSections>;
export type SelectAssessmentQuestion = Select<typeof s.assessmentQuestions>;
export type InsertAssessmentQuestion = Insert<typeof s.assessmentQuestions>;

// Delivery
export type SelectAssignment = Select<typeof s.assignments>;
export type InsertAssignment = Insert<typeof s.assignments>;
export type SelectAttempt = Select<typeof s.attempts>;
export type InsertAttempt = Insert<typeof s.attempts>;
export type SelectResponse = Select<typeof s.responses>;
export type InsertResponse = Insert<typeof s.responses>;
export type SelectAttemptTargetScore = Select<typeof s.attemptTargetScores>;
export type InsertAttemptTargetScore = Insert<typeof s.attemptTargetScores>;
export type SelectAssignmentFinalScore = Select<typeof s.assignmentFinalScores>;
export type InsertAssignmentFinalScore = Insert<typeof s.assignmentFinalScores>;

// Learning cycle
export type SelectCorrection = Select<typeof s.corrections>;
export type InsertCorrection = Insert<typeof s.corrections>;
export type SelectWorksheet = Select<typeof s.worksheets>;
export type InsertWorksheet = Insert<typeof s.worksheets>;
export type SelectWorksheetEvent = Select<typeof s.worksheetEvents>;
export type InsertWorksheetEvent = Insert<typeof s.worksheetEvents>;
export type SelectRelearningActivity = Select<typeof s.relearningActivities>;
export type InsertRelearningActivity = Insert<typeof s.relearningActivities>;
export type SelectActivityTarget = Select<typeof s.activityTargets>;
export type InsertActivityTarget = Insert<typeof s.activityTargets>;
export type SelectActivityCompletion = Select<typeof s.activityCompletions>;
export type InsertActivityCompletion = Insert<typeof s.activityCompletions>;
export type SelectPracticeSet = Select<typeof s.practiceSets>;
export type InsertPracticeSet = Insert<typeof s.practiceSets>;
export type SelectPracticeSetQuestion = Select<typeof s.practiceSetQuestions>;
export type InsertPracticeSetQuestion = Insert<typeof s.practiceSetQuestions>;
export type SelectPracticeSetTarget = Select<typeof s.practiceSetTargets>;
export type InsertPracticeSetTarget = Insert<typeof s.practiceSetTargets>;
export type SelectPracticeAttempt = Select<typeof s.practiceAttempts>;
export type InsertPracticeAttempt = Insert<typeof s.practiceAttempts>;
export type SelectRetakeGate = Select<typeof s.retakeGates>;
export type InsertRetakeGate = Insert<typeof s.retakeGates>;
export type SelectAssignmentPin = Select<typeof s.assignmentPins>;
export type InsertAssignmentPin = Insert<typeof s.assignmentPins>;

// Sharing
export type SelectShare = Select<typeof s.shares>;
export type InsertShare = Insert<typeof s.shares>;

// JSON column shapes re-exported for convenience
export type {
  CompletionEvidence,
  GradingConfig,
  NumericGradingConfig,
  PerTargetBest,
  ServedQuestion,
  TemplateVariable,
} from "./schema";
