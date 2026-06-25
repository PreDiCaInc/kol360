'use client';

// v1.17.63 — Renders the Insights Use Cases guide content.
//
// Single component so the same DOM works inside the standalone page
// (/admin/dashboards/guide) and inside the side-drawer triggered from
// the dashboard header. The only difference between the two surfaces
// is the wrapping chrome (header, close button, max-width) — the
// content body is identical.

import { Badge } from '@/components/ui/badge';
import {
  CASE_STUDIES,
  PRACTICE_SCENARIOS,
} from '@/content/insights-guide/guide-content';

const ASSET_BASE = '/help/insights-guide';

export function InsightsGuideContent() {
  return (
    <article className="prose-base max-w-none space-y-12">
      <Intro />

      <TableOfContents />

      <CaseStudiesSection />

      <PracticeSection />
    </article>
  );
}

function Intro() {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight">
        Get started with Insights
      </h2>
      <p className="mt-3 text-muted-foreground">
        This guide walks through real business questions you can answer with
        the Insights dashboards — which speaker to pick, who to invite, how to
        build a shortlist. Each case study below shows the exact tab to open,
        the filters to apply, and the columns to read. The "Try It Yourself"
        scenarios at the end are practice prompts to run on your own data.
      </p>
    </section>
  );
}

function TableOfContents() {
  return (
    <nav aria-label="Guide contents" className="rounded-lg border bg-muted/30 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Contents
      </h3>
      <ol className="mt-3 space-y-1.5 text-sm">
        {CASE_STUDIES.map((c, i) => (
          <li key={c.slug}>
            <a
              href={`#${c.slug}`}
              className="text-primary hover:underline"
            >
              Case Study {i + 1}: {c.title}
            </a>
          </li>
        ))}
        <li className="pt-2">
          <a href="#practice" className="text-primary hover:underline">
            Try It Yourself — 4 practice scenarios
          </a>
        </li>
      </ol>
    </nav>
  );
}

function CaseStudiesSection() {
  return (
    <section className="space-y-12">
      {CASE_STUDIES.map((c, i) => (
        <CaseStudyBlock key={c.slug} index={i + 1} caseStudy={c} />
      ))}
    </section>
  );
}

function CaseStudyBlock({
  index,
  caseStudy,
}: {
  index: number;
  caseStudy: (typeof CASE_STUDIES)[number];
}) {
  return (
    <section
      id={caseStudy.slug}
      className="scroll-mt-20 border-t border-border/60 pt-8"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Case Study {index}
        </p>
        <h3 className="text-xl font-semibold tracking-tight">
          {caseStudy.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {caseStudy.tabs.map((t) => (
            <Badge key={t} variant="outline" className="text-xs">
              {t}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{caseStudy.scenario}</p>
      </header>

      <ol className="mt-6 space-y-8">
        {caseStudy.steps.map((step, i) => (
          <li key={i} className="space-y-3">
            <div>
              <p className="text-sm leading-relaxed">
                {step.n !== undefined && (
                  <span className="font-semibold">Step {step.n}. </span>
                )}
                {step.body}
              </p>
              {step.note && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Note: {step.note}
                </p>
              )}
            </div>
            {step.image && (
              <figure className="overflow-hidden rounded-lg border bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${ASSET_BASE}/${step.image}`}
                  alt={step.imageAlt ?? ''}
                  className="block w-full"
                  loading="lazy"
                />
              </figure>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PracticeSection() {
  return (
    <section id="practice" className="scroll-mt-20 border-t border-border/60 pt-8">
      <header>
        <h3 className="text-xl font-semibold tracking-tight">Try It Yourself</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Four practice scenarios — no answers provided. Open the dashboards
          alongside this guide and walk through them. Each is written as a
          question your team might actually bring to KOL360.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PRACTICE_SCENARIOS.map((s, i) => (
          <div
            key={s.slug}
            id={s.slug}
            className="rounded-lg border bg-card p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scenario {i + 1}
            </p>
            <h4 className="mt-1 text-base font-semibold">{s.title}</h4>
            <p className="mt-2 text-sm text-muted-foreground">{s.scenario}</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">Try it: </span>
              {s.prompt}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
