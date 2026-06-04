-- v1.17.24 — convert "Practice Setting" survey question from SINGLE_CHOICE
-- to MULTI_CHOICE.
--
-- Customer-reported: "The practice setting is only allowing for the
-- selection of one setting, and we would like it to allow to select
-- multiple settings."
--
-- Shape change:
--   SINGLE_CHOICE: answerJson = {"selected": "Combination MD/OD Practice"}
--   MULTI_CHOICE:  answerJson = {"selected": ["Combination MD/OD Practice"]}
--
-- Two steps, both idempotent:
--   1. Backfill existing answers: convert string `selected` to a 1-element
--      array. Re-running is safe (CASE only fires for string values).
--   2. Update Question.type. Re-running is a no-op.
--
-- Affected scope on prod:
--   - 1 Question row (id cmmjng7v9006vvqf8qbryhwoj)
--   - 6 SurveyQuestion snapshots (no type field — picks up from Question)
--   - 1,266 SurveyResponseAnswer rows
--
-- Order matters: backfill FIRST so once the Question.type flip happens,
-- every existing answer already has the array shape the new MULTI_CHOICE
-- code paths expect (insights byPracticeSetting reads via
-- jsonb_array_elements_text(answerJson->'selected')).

-- Step 1: backfill answer shape.
UPDATE "SurveyResponseAnswer" sra
SET "answerJson" = jsonb_set(
  sra."answerJson",
  '{selected}',
  to_jsonb(ARRAY[sra."answerJson"->>'selected'])
)
FROM "SurveyQuestion" sq
WHERE sra."questionId" = sq.id
  AND LOWER(sq."questionTextSnapshot") LIKE '%practice setting%'
  AND sra."answerJson" IS NOT NULL
  AND jsonb_typeof(sra."answerJson"->'selected') = 'string';

-- Step 2: flip Question.type.
UPDATE "Question"
SET "type" = 'MULTI_CHOICE'
WHERE LOWER("text") LIKE '%practice setting%'
  AND "type" = 'SINGLE_CHOICE';

-- Sanity checks (Q.type should be MULTI_CHOICE; no SurveyResponseAnswer
-- should have a string `selected` for the Practice Setting question):
SELECT "type", COUNT(*) FROM "Question" WHERE LOWER("text") LIKE '%practice setting%' GROUP BY "type";

SELECT jsonb_typeof(sra."answerJson"->'selected') AS shape, COUNT(*)
FROM "SurveyResponseAnswer" sra
JOIN "SurveyQuestion" sq ON sq.id = sra."questionId"
WHERE LOWER(sq."questionTextSnapshot") LIKE '%practice setting%'
GROUP BY shape;
