'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  useSurvey,
  useStartSurvey,
  useSaveProgress,
  useSubmitSurvey,
  SurveyAlreadyCompletedError,
} from '@/hooks/use-survey-taking';
import {
  sanitizeHtml,
  replacePlaceholders,
  DEFAULT_WELCOME_TITLE,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_THANKYOU_TITLE,
  DEFAULT_THANKYOU_MESSAGE,
  DEFAULT_ALREADYDONE_TITLE,
  DEFAULT_ALREADYDONE_MESSAGE,
  DEFAULT_DISQUALIFIED_TITLE,
  DEFAULT_DISQUALIFIED_MESSAGE,
} from '@/components/campaigns/template-preview-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
} from 'lucide-react';

type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'RATING' | 'TEXT' | 'MULTI_TEXT' | 'NUMBER' | 'DROPDOWN' | 'RANK_ORDER' | 'QUALIFYING';

interface QuestionOption {
  text: string;
  requiresText: boolean;
}

interface Question {
  id: string;
  questionId: string;
  text: string;
  type: QuestionType;
  section: string | null;
  sectionDescription: string | null;
  isRequired: boolean;
  options: QuestionOption[] | null;
  minEntries: number | null;
  defaultEntries: number | null;
}


// Build steps from questions - group questions from same section into one step/page
function buildSteps(questions: Question[]): { title: string; description: string | null; questions: Question[] }[] {
  const steps: { title: string; description: string | null; questions: Question[] }[] = [];

  for (const question of questions) {
    const section = question.section || 'General';
    const description = question.sectionDescription || null;

    const lastStep = steps[steps.length - 1];
    if (lastStep && lastStep.title === section) {
      lastStep.questions.push(question);
    } else {
      steps.push({ title: section, description, questions: [question] });
    }
  }

  return steps;
}

export default function SurveyPage() {
  const params = useParams();
  const token = params.token as string;

  const { data: survey, isLoading, isFetching, error } = useSurvey(token);
  const startSurvey = useStartSurvey();
  const saveProgress = useSaveProgress();
  const submitSurvey = useSubmitSurvey();

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [disqualified, setDisqualified] = useState(false);

  // Initialize answers from saved response and resume at the correct step
  // Only skip welcome screen if user has actually started (IN_PROGRESS status or has answers)
  useEffect(() => {
    if (survey?.response) {
      const hasAnswers = survey.response.answers && Object.keys(survey.response.answers).length > 0;
      if (hasAnswers) {
        setAnswers(survey.response.answers);
        setStarted(true);

        // Resume at the FIRST INCOMPLETE step — i.e. the lowest step index
        // where any REQUIRED question is unanswered. This prevents the user
        // from being dropped past an incomplete page (which previously caused
        // submit failures with no clear indication of what was missing).
        const steps = buildSteps(survey.questions);
        const answeredQuestionIds = new Set(Object.keys(survey.response.answers));

        const savedAnswers = survey.response.answers;
        const isAnswered = (qid: string) => {
          const v = savedAnswers[qid];
          if (!answeredQuestionIds.has(qid)) return false;
          if (v === null || v === undefined || v === '') return false;
          if (Array.isArray(v) && v.filter(Boolean).length === 0) return false;
          return true;
        };

        let resumeStep = 0;
        for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
          const stepComplete = steps[stepIdx].questions.every(q => {
            if (!q.isRequired) return true; // optional questions don't block
            return isAnswered(q.id);
          });
          if (!stepComplete) {
            resumeStep = stepIdx;
            break;
          }
          // All required answered on this step — tentatively advance to next
          resumeStep = stepIdx + 1;
        }
        // Cap at last step (so the user can submit if everything is answered)
        if (resumeStep >= steps.length) resumeStep = steps.length - 1;
        setCurrentStep(resumeStep);
      } else if (survey.response.status === 'IN_PROGRESS') {
        // User clicked "Begin Survey" but hasn't answered anything yet
        setStarted(true);
      }
      // For PENDING/OPENED status with no answers, keep started=false to show welcome screen
    }
  }, [survey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!started || submitted) return;

    const interval = setInterval(() => {
      if (Object.keys(answers).length > 0) {
        saveProgress.mutate(
          { token, answers },
          {
            onSuccess: () => setLastSaved(new Date()),
          }
        );
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [started, submitted, answers, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    try {
      await startSurvey.mutateAsync(token);
      setStarted(true);
    } catch (err) {
      console.error('Failed to start survey:', err);
    }
  };

  const updateAnswer = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const handleSave = async () => {
    try {
      await saveProgress.mutateAsync({ token, answers });
      setLastSaved(new Date());
      setSaveMessage('Your progress has been saved. You can use this link to come back and finish later.');
      setTimeout(() => setSaveMessage(null), 8000);
    } catch (err) {
      console.error('Failed to save:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setSaveMessage(`Failed to save: ${errorMessage}`);
      setTimeout(() => setSaveMessage(null), 8000);
    }
  };

  const validateQuestion = (question: Question): string | null => {
    const answer = answers[question.id];

    if (question.isRequired) {
      const isEmpty =
        answer === undefined ||
        answer === null ||
        answer === '' ||
        (Array.isArray(answer) && answer.filter(Boolean).length === 0) ||
        // MULTI_CHOICE stores { selected: string[], texts: {} }
        (typeof answer === 'object' && !Array.isArray(answer) && answer !== null &&
          'selected' in (answer as Record<string, unknown>) &&
          Array.isArray((answer as { selected: unknown[] }).selected) &&
          (answer as { selected: unknown[] }).selected.length === 0) ||
        // RANK_ORDER stores { ranked: string[], texts?: {} }
        (typeof answer === 'object' && !Array.isArray(answer) && answer !== null &&
          'ranked' in (answer as Record<string, unknown>) &&
          Array.isArray((answer as { ranked: unknown[] }).ranked) &&
          (answer as { ranked: unknown[] }).ranked.length === 0);

      if (isEmpty) {
        return 'This question is required';
      }
    }

    if (question.type === 'MULTI_TEXT' && question.minEntries != null && question.minEntries > 0) {
      const filledEntries = Array.isArray(answer) ? answer.filter(Boolean).length : 0;
      if (filledEntries < question.minEntries) {
        return `Please provide at least ${question.minEntries} names`;
      }
    }

    if (question.type === 'RANK_ORDER' && question.minEntries != null && question.minEntries > 0) {
      const ranked = Array.isArray(answer) ? answer : (answer as { ranked?: string[] })?.ranked || [];
      if (ranked.length < question.minEntries) {
        return `Please rank at least ${question.minEntries} items`;
      }
    }

    return null;
  };

  const validateCurrentStep = (): boolean => {
    if (!survey) return false;

    const steps = buildSteps(survey.questions);
    const currentStepQuestions = steps[currentStep]?.questions || [];
    const errors: Record<string, string> = {};

    for (const question of currentStepQuestions) {
      const error = validateQuestion(question);
      if (error) {
        errors[question.id] = error;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAllAnswers = (): boolean => {
    if (!survey) return false;

    const errors: Record<string, string> = {};

    for (const question of survey.questions) {
      const error = validateQuestion(question);
      if (error) {
        errors[question.id] = error;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    // Save progress when moving to next step
    try {
      await saveProgress.mutateAsync({ token, answers });
      setLastSaved(new Date());
    } catch (err) {
      console.error('Failed to save:', err);
    }

    // Check for qualifying question disqualification
    const steps = buildSteps(survey!.questions);
    const currentQuestions = steps[currentStep].questions;
    const hasDisqualifyingAnswer = currentQuestions.some((q) => {
      if (q.type !== 'QUALIFYING') return false;
      const ans = answers[q.id];
      if (!ans) return false;
      // Disqualify if answer matches the second option (disqualify option)
      const disqualifyText = q.options?.[1]?.text || 'No';
      return ans === disqualifyText;
    });
    if (hasDisqualifyingAnswer) {
      setDisqualified(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      // Scroll to top on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    if (!validateAllAnswers()) {
      // Navigate to the first step that has a missing/invalid required answer
      // so the user can actually see and fix the error.
      const steps = buildSteps(survey!.questions);
      let firstErrorStep = -1;
      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const stepHasError = steps[stepIdx].questions.some(q => validateQuestion(q) !== null);
        if (stepHasError) {
          firstErrorStep = stepIdx;
          break;
        }
      }
      if (firstErrorStep !== -1 && firstErrorStep !== currentStep) {
        setCurrentStep(firstErrorStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Check for qualifying question disqualification on current (last) step
    const steps = buildSteps(survey!.questions);
    const currentQuestions = steps[currentStep].questions;
    const hasDisqualifyingAnswer = currentQuestions.some((q) => {
      if (q.type !== 'QUALIFYING') return false;
      const ans = answers[q.id];
      if (!ans) return false;
      const disqualifyText = q.options?.[1]?.text || 'No';
      return ans === disqualifyText;
    });
    if (hasDisqualifyingAnswer) {
      // Save progress so the "No" answer is recorded
      try {
        await saveProgress.mutateAsync({ token, answers });
      } catch (err) {
        console.error('Failed to save:', err);
      }
      setDisqualified(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      await submitSurvey.mutateAsync({ token, answers });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while submitting your survey. Please try again.';
      setSaveMessage(`Submit failed: ${errorMessage}`);
      setTimeout(() => setSaveMessage(null), 10000);
    }
  };

  // buildSteps is defined outside the component (above) for use in both useEffect and render

  // Loading state (includes retry after rate limiting)
  if (isLoading || (isFetching && !survey)) {
    const isRetrying = error?.message?.includes('Too many requests');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          {isRetrying && (
            <p className="text-sm text-muted-foreground">Please wait, loading your survey...</p>
          )}
        </div>
      </div>
    );
  }

  // Already completed state - render custom HTML template
  if (error instanceof SurveyAlreadyCompletedError) {
    const alreadyDoneHtml = replacePlaceholders(
      error.htmlMessage || DEFAULT_ALREADYDONE_MESSAGE.trim(),
      '',
      error.honorariumAmount,
      {
        title: error.customTitle || DEFAULT_ALREADYDONE_TITLE,
      }
    );

    return (
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(alreadyDoneHtml) }} />
    );
  }

  // Error state
  if (error || !survey) {
    const errorMessage = error instanceof Error ? error.message : 'This survey link is invalid or has expired.';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                Survey Not Available
              </h2>
              <p className="text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitted state - render full HTML template
  if (submitted) {
    const thankYouHtml = replacePlaceholders(
      survey.campaign.surveyThankYouMessage || DEFAULT_THANKYOU_MESSAGE.trim(),
      survey.campaign.name || '',
      survey.campaign.honorariumAmount,
      {
        title: survey.campaign.surveyThankYouTitle || DEFAULT_THANKYOU_TITLE,
        lastName: survey.hcp.lastName,
      }
    );

    return (
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(thankYouHtml) }} />
    );
  }

  // Disqualified state - render disqualification template
  if (disqualified) {
    const disqualifiedHtml = replacePlaceholders(
      survey.campaign.surveyDisqualifiedMessage || DEFAULT_DISQUALIFIED_MESSAGE.trim(),
      survey.campaign.name || '',
      survey.campaign.honorariumAmount,
      {
        title: survey.campaign.surveyDisqualifiedTitle || DEFAULT_DISQUALIFIED_TITLE,
        lastName: survey.hcp.lastName,
      }
    );

    return (
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(disqualifiedHtml) }} />
    );
  }

  const steps = buildSteps(survey.questions);
  const totalSteps = steps.length;
  const totalQuestions = survey.questions.length;
  const answeredQuestions = survey.questions.filter((q) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === null || answer === '') return false;
    if (Array.isArray(answer)) {
      return answer.filter(Boolean).length > 0;
    }
    if (typeof answer === 'object' && answer !== null) {
      const obj = answer as { selected?: string | string[] };
      if ('selected' in obj) {
        if (Array.isArray(obj.selected)) {
          return obj.selected.length > 0;
        }
        return obj.selected !== undefined && obj.selected !== '';
      }
    }
    return true;
  }).length;
  const progress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  // Welcome screen - render full HTML template
  if (!started) {
    const welcomeHtml = replacePlaceholders(
      survey.campaign.surveyWelcomeMessage || DEFAULT_WELCOME_MESSAGE.trim(),
      survey.campaign.name || '',
      survey.campaign.honorariumAmount,
      {
        title: survey.campaign.surveyWelcomeTitle || survey.campaign.name || DEFAULT_WELCOME_TITLE,
        lastName: survey.hcp.lastName,
      }
    );

    const handleWelcomeClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-action="begin-survey"]');
      if (button) {
        e.preventDefault();
        handleStart();
      }
    };

    return (
      <div onClick={handleWelcomeClick}>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(welcomeHtml) }} />
        {/* Loading overlay when starting */}
        {startSurvey.isPending && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3 shadow-xl">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Starting survey...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4 sm:py-8">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Progress Header */}
        <Card>
          <CardContent className="py-4">
            <div className="space-y-3">
              {/* Step indicator */}
              <div className="text-sm text-muted-foreground text-center">
                Step {currentStep + 1} of {totalSteps}
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                />
              </div>
              {/* Progress dots for mobile */}
              <div className="flex justify-center gap-1.5 flex-wrap">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentStep
                        ? 'bg-primary w-4'
                        : idx < currentStep
                        ? 'bg-primary/60'
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
              {lastSaved && (
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Save className="w-3 h-3" />
                  Saved {lastSaved.toLocaleTimeString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question(s) Card */}
        <Card>
          <CardContent className="py-6 space-y-6">
            {currentStepData.description && (
              <p className="text-lg font-medium leading-relaxed">
                {currentStepData.description}
              </p>
            )}
            {currentStepData.questions.map((question, idx) => (
              <QuestionRenderer
                key={question.id}
                question={question}
                index={idx}
                value={answers[question.id]}
                onChange={(value) => updateAnswer(question.id, value)}
                error={validationErrors[question.id]}
                showNumber={currentStepData.questions.length > 1}
              />
            ))}
          </CardContent>
        </Card>

        {/* Navigation */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={isFirstStep}
                className="flex-1"
                size="lg"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>

              {isLastStep ? (
                <Button
                  onClick={handleSubmit}
                  disabled={submitSurvey.isPending}
                  className="flex-1"
                  size="lg"
                >
                  {submitSurvey.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Submit
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={saveProgress.isPending}
                  className="flex-1"
                  size="lg"
                >
                  {saveProgress.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>

            {/* Save for later button */}
            <Button
              variant="ghost"
              onClick={handleSave}
              disabled={saveProgress.isPending}
              className="w-full mt-3 text-muted-foreground"
              size="sm"
            >
              <Save className="w-4 h-4 mr-2" />
              Save and continue later
            </Button>

            {saveMessage && (
              <div className={`text-sm mt-3 p-3 rounded text-center flex items-center justify-center gap-2 ${saveMessage.toLowerCase().includes('failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {!saveMessage.toLowerCase().includes('failed') && <CheckCircle2 className="w-4 h-4" />}
                {saveMessage.toLowerCase().includes('failed') && <AlertCircle className="w-4 h-4" />}
                <span>{saveMessage}</span>
              </div>
            )}

            {Object.keys(validationErrors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-3 text-sm">
                <p className="text-red-800 font-medium">
                  {Object.keys(validationErrors).length === 1
                    ? '1 required question needs an answer.'
                    : `${Object.keys(validationErrors).length} required questions need answers.`}
                </p>
                <p className="text-red-700 text-xs mt-1">
                  We&apos;ve highlighted them in red. Please scroll up to review and complete them before continuing.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface QuestionRendererProps {
  question: Question;
  index: number;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  showNumber?: boolean;
}

function QuestionRenderer({ question, index, value, onChange, error, showNumber = true }: QuestionRendererProps) {
  const renderInput = () => {
    switch (question.type) {
      case 'SINGLE_CHOICE':
        return (
          <RadioGroup
            value={(value as { selected: string; text?: string })?.selected || (value as string)}
            onValueChange={(selected) => onChange({ selected, text: '' })}
            className="space-y-3"
          >
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-start gap-3">
                <RadioGroupItem value={option.text} id={`${question.id}-${option.text}`} className="mt-1" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`${question.id}-${option.text}`} className="text-base font-normal cursor-pointer">
                    {option.text}
                  </Label>
                  {option.requiresText && (value as { selected: string })?.selected === option.text && (
                    <Input
                      placeholder="Please specify..."
                      value={(value as { selected: string; text?: string })?.text || ''}
                      onChange={(e) => onChange({ selected: option.text, text: e.target.value })}
                    />
                  )}
                </div>
              </div>
            ))}
          </RadioGroup>
        );

      case 'MULTI_CHOICE':
        const selectedOptions = (value as { selected: string[]; texts?: Record<string, string> }) || { selected: [], texts: {} };
        const selected = Array.isArray(value) ? value : selectedOptions.selected || [];
        const texts = selectedOptions.texts || {};
        return (
          <div className="space-y-3">
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-start gap-3">
                <Checkbox
                  id={`${question.id}-${option.text}`}
                  checked={selected.includes(option.text)}
                  onCheckedChange={(checked) => {
                    const newSelected = checked
                      ? [...selected, option.text]
                      : selected.filter((o) => o !== option.text);
                    onChange({ selected: newSelected, texts });
                  }}
                  className="mt-1"
                />
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`${question.id}-${option.text}`} className="text-base font-normal cursor-pointer">
                    {option.text}
                  </Label>
                  {option.requiresText && selected.includes(option.text) && (
                    <Input
                      placeholder="Please specify..."
                      value={texts[option.text] || ''}
                      onChange={(e) => onChange({ selected, texts: { ...texts, [option.text]: e.target.value } })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'RATING':
        const ratingValue = value as number;
        return (
          <div className="flex gap-2 justify-center flex-wrap">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant={ratingValue === n ? 'default' : 'outline'}
                onClick={() => onChange(n)}
                className="w-12 h-12 text-lg"
              >
                {n}
              </Button>
            ))}
          </div>
        );

      case 'TEXT':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter your response..."
            className="text-base"
          />
        );

      case 'MULTI_TEXT':
        return (
          <MultiTextInput
            value={value as string[]}
            onChange={onChange}
            minEntries={question.minEntries}
            defaultEntries={question.defaultEntries}
          />
        );

      case 'NUMBER':
        return (
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={(value as string | number) ?? ''}
            onChange={(e) => {
              // Store as string to preserve leading zeros (e.g. zip codes "02139")
              const v = e.target.value.replace(/[^0-9]/g, '');
              onChange(v);
            }}
            placeholder="Enter a number..."
            className="text-base"
          />
        );

      case 'DROPDOWN':
        return (
          <Select
            value={(value as string) || ''}
            onValueChange={(val) => onChange(val)}
          >
            <SelectTrigger className="text-base">
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {question.options?.map((option) => (
                <SelectItem key={option.text} value={option.text}>
                  {option.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'RANK_ORDER':
        return (
          <RankOrderInput
            options={question.options || []}
            value={value as RankOrderValue}
            onChange={onChange}
          />
        );

      case 'QUALIFYING': {
        const qualOptions = question.options?.length === 2
          ? question.options
          : [{ text: 'Yes', requiresText: false }, { text: 'No', requiresText: false }];
        return (
          <RadioGroup
            value={(value as string) || ''}
            onValueChange={(val) => onChange(val)}
            className="space-y-3"
          >
            {qualOptions.map((opt, i) => (
              <div key={i} className="flex items-start gap-3">
                <RadioGroupItem value={opt.text} id={`${question.id}-opt-${i}`} className="mt-1" />
                <Label htmlFor={`${question.id}-opt-${i}`} className="text-base font-normal cursor-pointer">{opt.text}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-medium leading-relaxed">
          {showNumber && <span className="text-muted-foreground mr-2">{index + 1}.</span>}
          {question.text}
          {question.isRequired && <span className="text-red-500 ml-1">*</span>}
        </p>
      </div>
      <div className="pl-0 sm:pl-6">
        {renderInput()}
      </div>
      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
}

interface MultiTextInputProps {
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  minEntries: number | null;
  defaultEntries: number | null;
}

function MultiTextInput({ value, onChange, minEntries, defaultEntries }: MultiTextInputProps) {
  const minRequired = minEntries ?? 1;
  const defaultCount = defaultEntries ?? minRequired;

  const entries = (value && value.length >= defaultCount) ? value : Array(defaultCount).fill('');

  useEffect(() => {
    if (!value || value.length === 0) {
      onChange(Array(defaultCount).fill(''));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = () => {
    onChange([...entries, '']);
  };

  const updateEntry = (index: number, newValue: string) => {
    const updated = [...entries];
    updated[index] = newValue;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            value={entry}
            onChange={(e) => updateEntry(index, e.target.value)}
            placeholder={`Name ${index + 1}`}
            className="text-base"
          />
          {index < minRequired && (
            <span className="text-red-500 text-sm shrink-0">*</span>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addEntry}>
        <Plus className="w-4 h-4 mr-1" />
        Add Another
      </Button>
      {minRequired > 1 && (
        <p className="text-xs text-muted-foreground">
          * Minimum {minRequired} names required
        </p>
      )}
    </div>
  );
}

// Answer shape: string[] (legacy) or { ranked: string[], texts?: Record<string, string> }
type RankOrderValue = string[] | { ranked: string[]; texts?: Record<string, string> };

interface RankOrderInputProps {
  options: QuestionOption[];
  value: RankOrderValue | undefined;
  onChange: (value: RankOrderValue) => void;
}

function RankOrderInput({ options, value, onChange }: RankOrderInputProps) {
  const optionTexts = options.map((o) => o.text);
  const hasRequiresText = options.some((o) => o.requiresText);

  // Extract ranked array and texts from value
  const ranked = Array.isArray(value) ? value : (value?.ranked || []);
  const texts = Array.isArray(value) ? {} : (value?.texts || {});

  // Items not yet ranked (maintain original order)
  const available = optionTexts.filter((t) => !ranked.includes(t));

  // Build a lookup for requiresText from options
  const requiresTextMap: Record<string, boolean> = {};
  options.forEach((o) => { if (o.requiresText) requiresTextMap[o.text] = true; });

  const emitChange = (newRanked: string[], newTexts?: Record<string, string>) => {
    if (hasRequiresText) {
      onChange({ ranked: newRanked, texts: newTexts || texts });
    } else {
      onChange(newRanked.length > 0 ? newRanked : []);
    }
  };

  const rankItem = (item: string) => {
    emitChange([...ranked, item]);
  };

  const unrankItem = (item: string) => {
    const newRanked = ranked.filter((r) => r !== item);
    const newTexts = { ...texts };
    delete newTexts[item];
    emitChange(newRanked, newTexts);
  };

  const resetAll = () => {
    if (hasRequiresText) {
      onChange({ ranked: [], texts: {} });
    } else {
      onChange([]);
    }
  };

  const handleTextChange = (optionText: string, val: string) => {
    emitChange(ranked, { ...texts, [optionText]: val });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Click items to rank them in your preferred order</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Available items */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Available</p>
          <div className="min-h-[80px] space-y-1.5 rounded-lg border border-dashed border-border/60 p-2">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 text-center py-4">All items ranked</p>
            ) : (
              available.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => rankItem(item)}
                  className="w-full text-left bg-white border rounded-lg px-3 py-2.5 shadow-sm hover:bg-accent hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <span className="text-base">{item}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Ranked items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Rankings</p>
            {ranked.length > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
          <div className="min-h-[80px] space-y-1.5 rounded-lg border border-dashed border-border/60 p-2">
            {ranked.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 text-center py-4">Click items on the left to rank them</p>
            ) : (
              ranked.map((item, index) => (
                <div key={item}>
                  <button
                    type="button"
                    onClick={() => unrankItem(item)}
                    className="w-full text-left bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 hover:bg-destructive/5 hover:border-destructive/30 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-base">{item}</span>
                      <X className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-destructive transition-colors shrink-0" />
                    </div>
                  </button>
                  {requiresTextMap[item] && (
                    <div className="ml-9 mt-1.5 mb-1">
                      <input
                        type="text"
                        placeholder="Please specify..."
                        value={texts[item] || ''}
                        onChange={(e) => handleTextChange(item, e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
