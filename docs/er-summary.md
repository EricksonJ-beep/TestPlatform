# Bloom ER summary

Generated from `drizzle/meta/0001_snapshot.json` (Ticket 0.4). Every table also has `id uuid pk`, `created_at`, and `updated_at` unless noted; `updated_at` is maintained by a trigger.

## Enums

- `activity_kind`: video | reading | link | guided_notes | worksheet
- `assessment_type`: practice | formative | summative
- `attempt_status`: in_progress | submitted | graded
- `bloom_level`: remember | understand | apply | analyze | evaluate | create
- `correction_status`: submitted | approved | returned
- `grading_mode`: auto | manual
- `media_kind`: image | video | audio | file
- `question_type`: multiple_choice | multiple_select | true_false | matching | ordering | fill_blank | numeric | short_answer | extended_response | image_hotspot
- `review_mode`: auto | teacher_approved
- `share_permission`: view | copy | co_edit
- `share_resource_type`: question_bank | assessment
- `stimulus_kind`: text | image | video | audio
- `user_role`: teacher | student | admin
- `worksheet_counts_as`: practice | activity | both
- `worksheet_event_type`: submit | progress

## Identity & orgs

- **organizations** — name text
- **users** — email text, password_hash text, role user_role, first_name text, last_name text, organization_id uuid?, must_change_password boolean =false, last_login_at timestamptz?
  - FKs: organization_id→organizations.id (set null)
  - unique: lower("email")
- **courses** — owner_id uuid, organization_id uuid?, name text, description text?
  - FKs: owner_id→users.id (cascade); organization_id→organizations.id (set null)
- **units** — course_id uuid, name text, sort_order integer =0
  - FKs: course_id→courses.id (cascade)
- **classes** — owner_id uuid, course_id uuid?, name text, period text?, term text?
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null)
- **enrollments** — class_id uuid, student_id uuid
  - FKs: class_id→classes.id (cascade); student_id→users.id (cascade)
  - unique: class_id+student_id

## Standards

- **learning_targets** — course_id uuid, unit_id uuid?, code text, title text, description text?, sort_order integer =0
  - FKs: course_id→courses.id (cascade); unit_id→units.id (set null)
  - unique: course_id+lower("code")
- **standards** — framework text, code text, description text?
  - unique: framework+code

## Content

- **media_assets** — owner_id uuid, kind media_kind, storage_key text, url text, mime_type text?, size_bytes integer?, width integer?, height integer?, duration_seconds integer?, alt_text text?
  - FKs: owner_id→users.id (cascade)
- **question_banks** — owner_id uuid, course_id uuid?, name text, description text?
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null)
- **stimuli** — owner_id uuid, course_id uuid?, kind stimulus_kind, title text?, ref text?, content text?, media_asset_id uuid?, media_url text?
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null); media_asset_id→media_assets.id (set null)
  - unique: course_id+lower("ref")
- **question_templates** — owner_id uuid, bank_id uuid?, title text, stem_template text, variables jsonb, answer_expression text, unit text?, grading_config jsonb?
  - FKs: owner_id→users.id (cascade); bank_id→question_banks.id (set null)
- **questions** — bank_id uuid, owner_id uuid, unit_id uuid?, type question_type, stem text, explanation text?, points integer =1, difficulty integer =3, bloom bloom_level?, grading grading_mode ='auto', grading_config jsonb?, topic text?, tags text[] ='{}', notes text?, media_asset_id uuid?, media_url text?, stimulus_id uuid?, template_id uuid?, external_id text?, version integer =1, previous_version_id uuid?, is_archived boolean =false
  - FKs: bank_id→question_banks.id (cascade); owner_id→users.id (cascade); unit_id→units.id (set null); media_asset_id→media_assets.id (set null); stimulus_id→stimuli.id (set null); template_id→question_templates.id (set null)
  - unique: bank_id+external_id
  - checks: questions_difficulty_range, questions_points_nonneg
- **question_options** — question_id uuid, content text, is_correct boolean =false, match_text text?, correct_position integer?, feedback text?, sort_order integer =0
  - FKs: question_id→questions.id (cascade)
- **question_targets** — question_id uuid, learning_target_id uuid
  - FKs: question_id→questions.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: question_id+learning_target_id
- **question_standards** — question_id uuid, standard_id uuid
  - FKs: question_id→questions.id (cascade); standard_id→standards.id (cascade)
  - unique: question_id+standard_id
- **question_pools** — owner_id uuid, course_id uuid?, name text, description text?
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null)
  - unique: course_id+lower("name")
- **pool_questions** — pool_id uuid, question_id uuid
  - FKs: pool_id→question_pools.id (cascade); question_id→questions.id (cascade)
  - unique: pool_id+question_id
- **pool_targets** — pool_id uuid, learning_target_id uuid
  - FKs: pool_id→question_pools.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: pool_id+learning_target_id

## Assessments

- **assessments** — owner_id uuid, course_id uuid?, type assessment_type, title text, instructions text?, attempt_limit integer?, review_mode review_mode ='auto', retake_threshold integer =80, optional_retakes boolean =true, randomize_questions boolean =false, randomize_options boolean =false, one_at_a_time boolean =false, allow_backtrack boolean =true, show_results_immediately boolean =true, is_published boolean =false
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null)
  - checks: assessments_threshold_range
- **assessment_sections** — assessment_id uuid, title text, instructions text?, sort_order integer =0, learning_target_id uuid?
  - FKs: assessment_id→assessments.id (cascade); learning_target_id→learning_targets.id (set null)
- **assessment_questions** — section_id uuid, question_id uuid?, pool_id uuid?, draw_count integer?, sort_order integer =0, points integer?
  - FKs: section_id→assessment_sections.id (cascade); question_id→questions.id (restrict); pool_id→question_pools.id (restrict)
  - checks: assessment_questions_question_xor_pool

## Delivery

- **assignments** — assessment_id uuid, class_id uuid, owner_id uuid, opens_at timestamptz?, closes_at timestamptz?, access_code text?, time_limit_minutes integer?, attempts_allowed integer?, review_mode review_mode ='auto', retake_threshold integer =80, optional_retakes boolean =true, tier2_max integer =2, results_released boolean =true
  - FKs: assessment_id→assessments.id (cascade); class_id→classes.id (cascade); owner_id→users.id (cascade)
  - checks: assignments_threshold_range
- **attempts** — assignment_id uuid, student_id uuid, number integer, scope jsonb?, question_set jsonb, status attempt_status ='in_progress', score double precision?, max_score double precision?, percent double precision?, started_at timestamptz, submitted_at timestamptz?, graded_at timestamptz?, due_at timestamptz?, tab_switches integer =0
  - FKs: assignment_id→assignments.id (cascade); student_id→users.id (cascade)
  - unique: assignment_id+student_id+number
- **responses** — attempt_id uuid, question_id uuid, answer jsonb?, auto_score double precision?, manual_score double precision?, is_correct boolean?, flagged boolean =false, answered_at timestamptz?
  - FKs: attempt_id→attempts.id (cascade); question_id→questions.id (restrict)
  - unique: attempt_id+question_id
- **attempt_target_scores** — attempt_id uuid, learning_target_id uuid, points_earned double precision, points_possible double precision, percent double precision
  - FKs: attempt_id→attempts.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: attempt_id+learning_target_id
- **assignment_final_scores** — assignment_id uuid, student_id uuid, per_target jsonb ='{}', total_earned double precision, total_possible double precision, percent double precision, tier integer?, targets_below_threshold integer =0, computed_at timestamptz
  - FKs: assignment_id→assignments.id (cascade); student_id→users.id (cascade)
  - unique: assignment_id+student_id

## Learning cycle

- **corrections** — attempt_id uuid, question_id uuid, student_id uuid, correct_answer text, explanation text, status correction_status ='submitted', ai_flag boolean =false, ai_note text?, reviewer_id uuid?, reviewer_note text?, reviewed_at timestamptz?, submitted_at timestamptz
  - FKs: attempt_id→attempts.id (cascade); question_id→questions.id (restrict); student_id→users.id (cascade); reviewer_id→users.id (set null)
  - unique: attempt_id+question_id
- **worksheets** — owner_id uuid?, course_id uuid?, script_id text, title text?, student_url text?, counts_as worksheet_counts_as ='practice', section_target_map jsonb?, registered boolean =false
  - FKs: owner_id→users.id (set null); course_id→courses.id (set null)
  - unique: script_id
- **worksheet_events** — worksheet_id uuid, student_id uuid?, email text, event worksheet_event_type, score double precision?, section_scores jsonb?, cards_correct integer?, total_cards integer?, total_checks integer?, occurred_at timestamptz, received_at timestamptz
  - FKs: worksheet_id→worksheets.id (cascade); student_id→users.id (set null)
  - unique: worksheet_id+email+occurred_at
- **relearning_activities** — owner_id uuid, course_id uuid?, kind activity_kind, title text, content text?, media_asset_id uuid?, url text?, prompts jsonb?, worksheet_id uuid?, requires_teacher_verification boolean =false, is_published boolean =false
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null); media_asset_id→media_assets.id (set null); worksheet_id→worksheets.id (set null)
- **activity_targets** — activity_id uuid, learning_target_id uuid
  - FKs: activity_id→relearning_activities.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: activity_id+learning_target_id
- **activity_completions** — student_id uuid, activity_id uuid, completed_at timestamptz, evidence jsonb?, teacher_verified boolean =false
  - FKs: student_id→users.id (cascade); activity_id→relearning_activities.id (cascade)
  - unique: student_id+activity_id
- **practice_sets** — owner_id uuid, course_id uuid?, title text, description text?, pool_id uuid?, draw_count integer?, worksheet_id uuid?, is_published boolean =false
  - FKs: owner_id→users.id (cascade); course_id→courses.id (set null); pool_id→question_pools.id (set null); worksheet_id→worksheets.id (set null)
- **practice_set_questions** — practice_set_id uuid, question_id uuid, sort_order integer =0
  - FKs: practice_set_id→practice_sets.id (cascade); question_id→questions.id (cascade)
  - unique: practice_set_id+question_id
- **practice_set_targets** — practice_set_id uuid, learning_target_id uuid
  - FKs: practice_set_id→practice_sets.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: practice_set_id+learning_target_id
- **practice_attempts** — student_id uuid, practice_set_id uuid, question_set jsonb, answers jsonb ='{}', score double precision?, max_score double precision?, percent double precision?, started_at timestamptz, completed_at timestamptz?
  - FKs: student_id→users.id (cascade); practice_set_id→practice_sets.id (cascade)
- **retake_gates** — student_id uuid, assignment_id uuid, learning_target_id uuid, required boolean =false, opted_in boolean =false, corrections_ok boolean =false, activity_ok boolean =false, practice_ok boolean =false, unlocked_at timestamptz?
  - FKs: student_id→users.id (cascade); assignment_id→assignments.id (cascade); learning_target_id→learning_targets.id (cascade)
  - unique: student_id+assignment_id+learning_target_id
- **assignment_pins** — assignment_id uuid, learning_target_id uuid, activity_id uuid?, practice_set_id uuid?
  - FKs: assignment_id→assignments.id (cascade); learning_target_id→learning_targets.id (cascade); activity_id→relearning_activities.id (cascade); practice_set_id→practice_sets.id (cascade)
  - checks: assignment_pins_has_target_item

## Sharing

- **shares** — resource_type share_resource_type, resource_id uuid, owner_id uuid, shared_with_user_id uuid, permission share_permission ='view'
  - FKs: owner_id→users.id (cascade); shared_with_user_id→users.id (cascade)
  - unique: resource_type+resource_id+shared_with_user_id

## Key decisions

- `questions` are independent records; `assessment_questions` points at a question **or** a pool (`draw_count`) — never both (check constraint).
- `assessment_sections.learning_target_id` makes each summative section map to one target; `attempts.scope` (jsonb list of target ids, null = full) drives targeted retakes.
- `attempts.question_set` stores the exact questions served so retakes and analytics are reproducible.
- `attempt_target_scores` is per attempt per target; `assignment_final_scores` holds the per-target best (jsonb) plus combined total and tier, recomputed by server code.
- `corrections.status` submitted|approved|returned with `ai_flag` + `ai_note`; `retake_gates` holds the three booleans per student × assignment × target.
- `assignments.retake_threshold` default 80; `tier2_max` default 2 sets tier boundaries.
- `shares` grants view|copy|co_edit on a question_bank or assessment to one user.
- `users.email` is unique case-insensitively; `password_hash` never leaves the server (see `PublicUser` in `src/db/types.ts`).
