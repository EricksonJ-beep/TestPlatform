/**
 * Bloom schema — PLAN.md §8, all groups: identity, standards, content,
 * assessments, delivery, learning cycle, sharing.
 *
 * Conventions
 * - uuid primary keys, `created_at` / `updated_at` on every table (an
 *   `updated_at` trigger lives in drizzle/0001_updated_at_trigger.sql).
 * - Questions are independent records; assessments point at them.
 * - Attempts store the exact question set served (`question_set`) so retakes
 *   and analytics are reproducible.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["teacher", "student", "admin"]);
export const assessmentType = pgEnum("assessment_type", ["practice", "formative", "summative"]);
export const reviewMode = pgEnum("review_mode", ["auto", "teacher_approved"]);
export const questionType = pgEnum("question_type", [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "matching",
  "ordering",
  "fill_blank",
  "numeric",
  "short_answer",
  "extended_response",
  "image_hotspot",
]);
export const gradingMode = pgEnum("grading_mode", ["auto", "manual"]);
export const bloomLevel = pgEnum("bloom_level", [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "submitted", "graded"]);
/** draft = autosaved, not yet submitted; submitted = awaiting review (auto mode approves at submit). */
export const correctionStatus = pgEnum("correction_status", [
  "draft",
  "submitted",
  "approved",
  "returned",
]);
export const sharePermission = pgEnum("share_permission", ["view", "copy", "co_edit"]);
export const shareResourceType = pgEnum("share_resource_type", ["question_bank", "assessment"]);
export const stimulusKind = pgEnum("stimulus_kind", ["text", "image", "video", "audio"]);
export const mediaKind = pgEnum("media_kind", ["image", "video", "audio", "file"]);
export const activityKind = pgEnum("activity_kind", [
  "video",
  "reading",
  "link",
  "guided_notes",
  "worksheet",
]);
export const worksheetCountsAs = pgEnum("worksheet_counts_as", ["practice", "activity", "both"]);
export const worksheetEventType = pgEnum("worksheet_event_type", ["submit", "progress"]);

// ---------------------------------------------------------------------------
// Identity & orgs
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Teachers always have one; students who joined with a class code may have none. */
    email: text("email"),
    /** Login name for students created through a join code (e.g. "braeden.allard"). */
    username: text("username"),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    /** Set when a teacher issues a temp password; the student is nudged to change it. */
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
    index("users_organization_idx").on(t.organizationId),
    index("users_role_idx").on(t.role),
  ]
);

export const courses = pgTable(
  "courses",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("courses_owner_idx").on(t.ownerId)]
);

export const units = pgTable(
  "units",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("units_course_idx").on(t.courseId)]
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    period: text("period"),
    term: text("term"),
    /** Short code students enter to join (PLAN.md: posted in Google Classroom); null = none yet. */
    joinCode: text("join_code"),
    joinOpen: boolean("join_open").default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    index("classes_owner_idx").on(t.ownerId),
    index("classes_course_idx").on(t.courseId),
    uniqueIndex("classes_join_code_unique").on(sql`lower(${t.joinCode})`),
  ]
);

/** Names the teacher expects in a class; a student claims one when joining with the code. */
export const rosterNames = pgTable(
  "roster_names",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Set once a student has claimed this name. */
    studentId: uuid("student_id").references(() => users.id, { onDelete: "set null" }),
    /** True when a student typed a name that wasn't on the list (teacher should check it). */
    selfEntered: boolean("self_entered").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("roster_names_class_idx").on(t.classId)]
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Accommodations (PLAN.md §3.6): extra time as a percent of the limit, font scale as a percent. */
    extraTimePercent: integer("extra_time_percent").default(0).notNull(),
    fontScale: integer("font_scale").default(100).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("enrollments_class_student_unique").on(t.classId, t.studentId),
    index("enrollments_student_idx").on(t.studentId),
  ]
);

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

export const learningTargets = pgTable(
  "learning_targets",
  {
    id: id(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    /** Short label shown on chips, e.g. "LT4". */
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("learning_targets_course_code_unique").on(t.courseId, sql`lower(${t.code})`),
    index("learning_targets_course_idx").on(t.courseId),
  ]
);

export const standards = pgTable(
  "standards",
  {
    id: id(),
    /** e.g. "NGSS", "WI" */
    framework: text("framework").notNull(),
    code: text("code").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("standards_framework_code_unique").on(t.framework, t.code)]
);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    /** R2 object key. */
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    altText: text("alt_text"),
    ...timestamps,
  },
  (t) => [index("media_assets_owner_idx").on(t.ownerId)]
);

export const questionBanks = pgTable(
  "question_banks",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    isArchived: boolean("is_archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("question_banks_owner_idx").on(t.ownerId)]
);

export const stimuli = pgTable(
  "stimuli",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    kind: stimulusKind("kind").notNull(),
    title: text("title"),
    /** Import handle from CSV `stimulus_ref`, unique within a course. */
    ref: text("ref"),
    content: text("content"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    mediaUrl: text("media_url"),
    ...timestamps,
  },
  (t) => [
    index("stimuli_owner_idx").on(t.ownerId),
    uniqueIndex("stimuli_course_ref_unique").on(t.courseId, sql`lower(${t.ref})`),
  ]
);

export type TemplateVariable = {
  name: string;
  min: number;
  max: number;
  step: number;
};

export const questionTemplates = pgTable(
  "question_templates",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bankId: uuid("bank_id").references(() => questionBanks.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    stemTemplate: text("stem_template").notNull(),
    variables: jsonb("variables").$type<TemplateVariable[]>().notNull(),
    answerExpression: text("answer_expression").notNull(),
    unit: text("unit"),
    gradingConfig: jsonb("grading_config").$type<NumericGradingConfig>(),
    ...timestamps,
  },
  (t) => [index("question_templates_owner_idx").on(t.ownerId)]
);

export type NumericGradingConfig = {
  mode: "exact" | "tolerance" | "percent_tolerance" | "range";
  tolerance?: number;
  percent?: number;
  min?: number;
  max?: number;
  unit?: string | null;
};
export type GradingConfig =
  | NumericGradingConfig
  | { keywords: string[]; minMatches?: number }
  | { acceptedAnswers: string[]; caseSensitive?: boolean }
  | { partialCredit: boolean }
  | Record<string, unknown>;

export const questions = pgTable(
  "questions",
  {
    id: id(),
    bankId: uuid("bank_id")
      .notNull()
      .references(() => questionBanks.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    type: questionType("type").notNull(),
    stem: text("stem").notNull(),
    explanation: text("explanation"),
    points: integer("points").default(1).notNull(),
    difficulty: integer("difficulty").default(3).notNull(),
    bloom: bloomLevel("bloom"),
    grading: gradingMode("grading").default("auto").notNull(),
    gradingConfig: jsonb("grading_config").$type<GradingConfig>(),
    topic: text("topic"),
    tags: text("tags")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    notes: text("notes"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    mediaUrl: text("media_url"),
    videoUrl: text("video_url"),
    stimulusId: uuid("stimulus_id").references(() => stimuli.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => questionTemplates.id, {
      onDelete: "set null",
    }),
    /** Import handle (CSV external_id) for update-on-reimport. */
    externalId: text("external_id"),
    version: integer("version").default(1).notNull(),
    previousVersionId: uuid("previous_version_id"),
    isArchived: boolean("is_archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("questions_bank_idx").on(t.bankId),
    index("questions_owner_idx").on(t.ownerId),
    index("questions_stimulus_idx").on(t.stimulusId),
    index("questions_template_idx").on(t.templateId),
    uniqueIndex("questions_bank_external_id_unique").on(t.bankId, t.externalId),
    check("questions_difficulty_range", sql`${t.difficulty} between 1 and 5`),
    check("questions_points_nonneg", sql`${t.points} >= 0`),
  ]
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: id(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isCorrect: boolean("is_correct").default(false).notNull(),
    /** Matching: the right-hand side this option pairs with. Ordering: the correct position. */
    matchText: text("match_text"),
    correctPosition: integer("correct_position"),
    feedback: text("feedback"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("question_options_question_idx").on(t.questionId)]
);

export const questionTargets = pgTable(
  "question_targets",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("question_targets_pk").on(t.questionId, t.learningTargetId),
    index("question_targets_target_idx").on(t.learningTargetId),
  ]
);

export const questionStandards = pgTable(
  "question_standards",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("question_standards_pk").on(t.questionId, t.standardId)]
);

export const questionPools = pgTable(
  "question_pools",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    /** When a draw picks a question that shares a stimulus, pull its whole group. */
    drawStimulusGroups: boolean("draw_stimulus_groups").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("question_pools_owner_idx").on(t.ownerId),
    uniqueIndex("question_pools_course_name_unique").on(t.courseId, sql`lower(${t.name})`),
  ]
);

export const poolQuestions = pgTable(
  "pool_questions",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => questionPools.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("pool_questions_pk").on(t.poolId, t.questionId),
    index("pool_questions_question_idx").on(t.questionId),
  ]
);

/** Pools must be tagged to learning targets so a retake covers the same targets. */
export const poolTargets = pgTable(
  "pool_targets",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => questionPools.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("pool_targets_pk").on(t.poolId, t.learningTargetId)]
);

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    type: assessmentType("type").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    /** Default attempt policy; assignments can override. null = unlimited (practice). */
    attemptLimit: integer("attempt_limit"),
    reviewMode: reviewMode("review_mode").default("auto").notNull(),
    retakeThreshold: integer("retake_threshold").default(80).notNull(),
    optionalRetakes: boolean("optional_retakes").default(true).notNull(),
    randomizeQuestions: boolean("randomize_questions").default(false).notNull(),
    randomizeOptions: boolean("randomize_options").default(false).notNull(),
    oneAtATime: boolean("one_at_a_time").default(false).notNull(),
    allowBacktrack: boolean("allow_backtrack").default(true).notNull(),
    showResultsImmediately: boolean("show_results_immediately").default(true).notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("assessments_owner_idx").on(t.ownerId),
    index("assessments_course_idx").on(t.courseId),
    check("assessments_threshold_range", sql`${t.retakeThreshold} between 0 and 100`),
  ]
);

/** Summatives: one section per learning target, each backed by a pool. */
export const assessmentSections = pgTable(
  "assessment_sections",
  {
    id: id(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    sortOrder: integer("sort_order").default(0).notNull(),
    learningTargetId: uuid("learning_target_id").references(() => learningTargets.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("assessment_sections_assessment_idx").on(t.assessmentId)]
);

/** A row is either a fixed question or a "draw N from pool" instruction. */
export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => assessmentSections.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").references(() => questions.id, { onDelete: "restrict" }),
    poolId: uuid("pool_id").references(() => questionPools.id, { onDelete: "restrict" }),
    drawCount: integer("draw_count"),
    sortOrder: integer("sort_order").default(0).notNull(),
    /** Overrides questions.points when set. */
    points: integer("points"),
    ...timestamps,
  },
  (t) => [
    index("assessment_questions_section_idx").on(t.sectionId),
    index("assessment_questions_question_idx").on(t.questionId),
    check(
      "assessment_questions_question_xor_pool",
      sql`(${t.questionId} is not null and ${t.poolId} is null) or (${t.questionId} is null and ${t.poolId} is not null and ${t.drawCount} > 0)`
    ),
  ]
);

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    accessCode: text("access_code"),
    timeLimitMinutes: integer("time_limit_minutes"),
    /** null = unlimited. Formative default 3; summative default 2 (1 + 1 retake). */
    attemptsAllowed: integer("attempts_allowed"),
    reviewMode: reviewMode("review_mode").default("auto").notNull(),
    retakeThreshold: integer("retake_threshold").default(80).notNull(),
    optionalRetakes: boolean("optional_retakes").default(true).notNull(),
    /** Tier boundaries: Tier 2 = 1..tier2Max targets below threshold; Tier 3 = more. */
    tier2Max: integer("tier2_max").default(2).notNull(),
    resultsReleased: boolean("results_released").default(true).notNull(),
    /** Hours a student must wait after submitting before the next attempt; 0 = none. */
    retakeWaitHours: integer("retake_wait_hours").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    index("assignments_class_idx").on(t.classId),
    index("assignments_assessment_idx").on(t.assessmentId),
    index("assignments_owner_idx").on(t.ownerId),
    check("assignments_threshold_range", sql`${t.retakeThreshold} between 0 and 100`),
  ]
);

export type ServedQuestion = {
  questionId: string;
  sectionId: string;
  learningTargetId: string | null;
  points: number;
  order: number;
  /** Option ids in the order served (when answer order is randomized). */
  optionOrder?: string[];
};

export const attempts = pgTable(
  "attempts",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Learning-target ids being retaken; null = full assessment. */
    scope: jsonb("scope").$type<string[] | null>(),
    /** Exact question set served, in order. */
    questionSet: jsonb("question_set").$type<ServedQuestion[]>().notNull(),
    status: attemptStatus("status").default("in_progress").notNull(),
    score: doublePrecision("score"),
    maxScore: doublePrecision("max_score"),
    percent: doublePrecision("percent"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    /** Server-enforced deadline for this attempt (start + limit + accommodations). */
    dueAt: timestamp("due_at", { withTimezone: true }),
    tabSwitches: integer("tab_switches").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attempts_assignment_student_number_unique").on(
      t.assignmentId,
      t.studentId,
      t.number
    ),
    index("attempts_student_idx").on(t.studentId),
    index("attempts_assignment_idx").on(t.assignmentId),
  ]
);

export const responses = pgTable(
  "responses",
  {
    id: id(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    /** Shape depends on question type: option id(s), text, number, pairs, order, point. */
    answer: jsonb("answer").$type<unknown>(),
    autoScore: doublePrecision("auto_score"),
    manualScore: doublePrecision("manual_score"),
    isCorrect: boolean("is_correct"),
    flagged: boolean("flagged").default(false).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Set when a teacher grades or overrides this response (manual_score holds the points). */
    graderNote: text("grader_note"),
    gradedBy: uuid("graded_by").references(() => users.id, { onDelete: "set null" }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("responses_attempt_question_unique").on(t.attemptId, t.questionId),
    index("responses_question_idx").on(t.questionId),
  ]
);

export const attemptTargetScores = pgTable(
  "attempt_target_scores",
  {
    id: id(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
    pointsEarned: doublePrecision("points_earned").notNull(),
    pointsPossible: doublePrecision("points_possible").notNull(),
    percent: doublePrecision("percent").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attempt_target_scores_unique").on(t.attemptId, t.learningTargetId),
    index("attempt_target_scores_target_idx").on(t.learningTargetId),
  ]
);

export type PerTargetBest = Record<
  string,
  { pointsEarned: number; pointsPossible: number; percent: number; fromAttemptId: string }
>;

/** Highest counts: per-target best for summatives, best attempt for formatives. */
export const assignmentFinalScores = pgTable(
  "assignment_final_scores",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    perTarget: jsonb("per_target").$type<PerTargetBest>().default({}).notNull(),
    totalEarned: doublePrecision("total_earned").notNull(),
    totalPossible: doublePrecision("total_possible").notNull(),
    percent: doublePrecision("percent").notNull(),
    /** 1, 2, or 3 (§3.11); null for non-summatives. */
    tier: integer("tier"),
    targetsBelowThreshold: integer("targets_below_threshold").default(0).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("assignment_final_scores_unique").on(t.assignmentId, t.studentId),
    index("assignment_final_scores_student_idx").on(t.studentId),
  ]
);

// ---------------------------------------------------------------------------
// Learning cycle
// ---------------------------------------------------------------------------

export const corrections = pgTable(
  "corrections",
  {
    id: id(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    correctAnswer: text("correct_answer").notNull(),
    explanation: text("explanation").notNull(),
    status: correctionStatus("status").default("draft").notNull(),
    aiFlag: boolean("ai_flag").default(false).notNull(),
    aiNote: text("ai_note"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewerNote: text("reviewer_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** null while the row is a draft. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("corrections_attempt_question_unique").on(t.attemptId, t.questionId),
    index("corrections_student_idx").on(t.studentId),
    index("corrections_status_idx").on(t.status),
  ]
);

export const worksheets = pgTable(
  "worksheets",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    /** Apps Script ScriptApp.getScriptId(); the webhook key. */
    scriptId: text("script_id").notNull(),
    title: text("title"),
    studentUrl: text("student_url"),
    countsAs: worksheetCountsAs("counts_as").default("practice").notNull(),
    /** { "Part D: LT4": "<learning_target_id>", ... } */
    sectionTargetMap: jsonb("section_target_map").$type<Record<string, string>>(),
    /** false until a teacher finishes tagging an auto-created entry. */
    registered: boolean("registered").default(false).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("worksheets_script_id_unique").on(t.scriptId)]
);

export const worksheetEvents = pgTable(
  "worksheet_events",
  {
    id: id(),
    worksheetId: uuid("worksheet_id")
      .notNull()
      .references(() => worksheets.id, { onDelete: "cascade" }),
    /** null when the email did not match a student ("unmatched submissions"). */
    studentId: uuid("student_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    event: worksheetEventType("event").notNull(),
    score: doublePrecision("score"),
    sectionScores: jsonb("section_scores").$type<Record<string, number>>(),
    cardsCorrect: integer("cards_correct"),
    totalCards: integer("total_cards"),
    totalChecks: integer("total_checks"),
    /** The worksheet's own timestamp; part of the idempotency key. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("worksheet_events_idempotent").on(t.worksheetId, t.email, t.occurredAt),
    index("worksheet_events_student_idx").on(t.studentId),
  ]
);

export const relearningActivities = pgTable(
  "relearning_activities",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    kind: activityKind("kind").notNull(),
    title: text("title").notNull(),
    /** Reading body (rich text) or guided-notes intro. */
    content: text("content"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    /** YouTube / external link. */
    url: text("url"),
    /** Guided notes prompts. */
    prompts: jsonb("prompts").$type<{ id: string; prompt: string }[]>(),
    worksheetId: uuid("worksheet_id").references(() => worksheets.id, { onDelete: "set null" }),
    requiresTeacherVerification: boolean("requires_teacher_verification").default(false).notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("relearning_activities_owner_idx").on(t.ownerId)]
);

export const activityTargets = pgTable(
  "activity_targets",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => relearningActivities.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("activity_targets_pk").on(t.activityId, t.learningTargetId),
    index("activity_targets_target_idx").on(t.learningTargetId),
  ]
);

export type CompletionEvidence = {
  watchPercent?: number;
  scrolledToEnd?: boolean;
  confirmed?: boolean;
  answers?: Record<string, string>;
  worksheetEventId?: string;
};

export const activityCompletions = pgTable(
  "activity_completions",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => relearningActivities.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
    evidence: jsonb("evidence").$type<CompletionEvidence>(),
    teacherVerified: boolean("teacher_verified").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("activity_completions_unique").on(t.studentId, t.activityId),
    index("activity_completions_activity_idx").on(t.activityId),
  ]
);

export const practiceSets = pgTable(
  "practice_sets",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Either explicit questions (practice_set_questions) or draw from a pool. */
    poolId: uuid("pool_id").references(() => questionPools.id, { onDelete: "set null" }),
    drawCount: integer("draw_count"),
    worksheetId: uuid("worksheet_id").references(() => worksheets.id, { onDelete: "set null" }),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("practice_sets_owner_idx").on(t.ownerId)]
);

export const practiceSetQuestions = pgTable(
  "practice_set_questions",
  {
    practiceSetId: uuid("practice_set_id")
      .notNull()
      .references(() => practiceSets.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [uniqueIndex("practice_set_questions_pk").on(t.practiceSetId, t.questionId)]
);

export const practiceSetTargets = pgTable(
  "practice_set_targets",
  {
    practiceSetId: uuid("practice_set_id")
      .notNull()
      .references(() => practiceSets.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("practice_set_targets_pk").on(t.practiceSetId, t.learningTargetId),
    index("practice_set_targets_target_idx").on(t.learningTargetId),
  ]
);

export const practiceAttempts = pgTable(
  "practice_attempts",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    practiceSetId: uuid("practice_set_id")
      .notNull()
      .references(() => practiceSets.id, { onDelete: "cascade" }),
    questionSet: jsonb("question_set").$type<ServedQuestion[]>().notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().default({}).notNull(),
    score: doublePrecision("score"),
    maxScore: doublePrecision("max_score"),
    percent: doublePrecision("percent"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    /** Completion = every question answered once. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("practice_attempts_student_idx").on(t.studentId),
    index("practice_attempts_set_idx").on(t.practiceSetId),
  ]
);

/** Recomputed by server code after every relevant event; never written by clients. */
export const retakeGates = pgTable(
  "retake_gates",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
    /** Below threshold on attempt 1 ("Must retake"). */
    required: boolean("required").default(false).notNull(),
    /** Student chose to retake an at/above-threshold target. */
    optedIn: boolean("opted_in").default(false).notNull(),
    correctionsOk: boolean("corrections_ok").default(false).notNull(),
    activityOk: boolean("activity_ok").default(false).notNull(),
    practiceOk: boolean("practice_ok").default(false).notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("retake_gates_unique").on(t.studentId, t.assignmentId, t.learningTargetId),
    index("retake_gates_assignment_idx").on(t.assignmentId),
  ]
);

/** Teacher pins a specific activity and/or practice set for a target on one assignment. */
export const assignmentPins = pgTable(
  "assignment_pins",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    learningTargetId: uuid("learning_target_id")
      .notNull()
      .references(() => learningTargets.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => relearningActivities.id, {
      onDelete: "cascade",
    }),
    practiceSetId: uuid("practice_set_id").references(() => practiceSets.id, {
      onDelete: "cascade",
    }),
    ...timestamps,
  },
  (t) => [
    index("assignment_pins_assignment_idx").on(t.assignmentId),
    check(
      "assignment_pins_has_target_item",
      sql`${t.activityId} is not null or ${t.practiceSetId} is not null`
    ),
  ]
);

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/** A bank or assessment shared by its owner with one user at one permission level. */
export const shares = pgTable(
  "shares",
  {
    id: id(),
    resourceType: shareResourceType("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharedWithUserId: uuid("shared_with_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: sharePermission("permission").default("view").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shares_resource_user_unique").on(t.resourceType, t.resourceId, t.sharedWithUserId),
    index("shares_shared_with_idx").on(t.sharedWithUserId),
    index("shares_resource_idx").on(t.resourceType, t.resourceId),
  ]
);
