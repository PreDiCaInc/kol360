-- Idempotent: prod applies migrations via raw psql.
-- Singleton (id='default') driving Insights influencer-type labels
-- (National Leaders / Rising Stars / Regional Influencers). Edit values
-- directly in DB to tune without redeploy. Defaults mirror
-- DEFAULT_INFLUENCER_THRESHOLDS in insights-report.service.ts.

CREATE TABLE IF NOT EXISTS "InfluencerThreshold" (
  "id"                         TEXT      PRIMARY KEY,
  "nationalLeaderMinComposite" INTEGER   NOT NULL,
  "nationalLeaderMinSurvey"    INTEGER   NOT NULL,
  "risingStarMinSurvey"        INTEGER   NOT NULL,
  "risingStarMaxComposite"     INTEGER   NOT NULL,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "InfluencerThreshold" (
  "id",
  "nationalLeaderMinComposite",
  "nationalLeaderMinSurvey",
  "risingStarMinSurvey",
  "risingStarMaxComposite"
) VALUES ('default', 30, 50, 30, 30)
ON CONFLICT ("id") DO NOTHING;
