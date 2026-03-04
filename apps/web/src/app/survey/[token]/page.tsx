'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  useSurvey,
  useStartSurvey,
  useSaveProgress,
  useSubmitSurvey,
} from '@/hooks/use-survey-taking';
import {
  sanitizeHtml,
  replacePlaceholders,
  DEFAULT_WELCOME_TITLE,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_THANKYOU_TITLE,
  DEFAULT_THANKYOU_MESSAGE,
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
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// Sections that should show all questions together (like form fields)
const GROUPED_SECTIONS = ['Demographics', 'Contact Information', 'Profile'];

export default function SurveyPage() {
  const params = useParams();
  const token = params.token as string;

  const { data: survey, isLoading, error } = useSurvey(token);
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

  // Initialize answers from saved response
  // Only skip welcome screen if user has actually started (IN_PROGRESS status or has answers)
  useEffect(() => {
    if (survey?.response) {
      const hasAnswers = survey.response.answers && Object.keys(survey.response.answers).length > 0;
      if (hasAnswers) {
        setAnswers(survey.response.answers);
        setStarted(true);
      } else if (survey.response.status === 'IN_PROGRESS') {
        // User clicked "Begin Survey" but hasn't answered anything yet
        setStarted(true);
      }
      // For PENDING/OPENED status with no answers, keep started=false to show welcome screen
    }
  }, [survey]);

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
  }, [started, submitted, answers, token, saveProgress]);

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
      if (
        answer === undefined ||
        answer === null ||
        answer === '' ||
        (Array.isArray(answer) && answer.filter(Boolean).length === 0)
      ) {
        return 'This question is required';
      }
    }

    if (question.type === 'MULTI_TEXT' && question.minEntries && question.minEntries > 1) {
      const filledEntries = Array.isArray(answer) ? answer.filter(Boolean).length : 0;
      if (filledEntries < question.minEntries) {
        return `Please provide at least ${question.minEntries} names`;
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
    }
  };

  // Build steps from questions - group certain sections, show others one at a time
  const buildSteps = (questions: Question[]): { title: string; description: string | null; questions: Question[] }[] => {
    const steps: { title: string; description: string | null; questions: Question[] }[] = [];
    let currentGroupedSection: { title: string; description: string | null; questions: Question[] } | null = null;

    for (const question of questions) {
      const section = question.section || 'General';
      const description = question.sectionDescription || null;
      const isGrouped = GROUPED_SECTIONS.some(gs =>
        section.toLowerCase().includes(gs.toLowerCase())
      );

      if (isGrouped) {
        // Group all questions from this section together
        if (currentGroupedSection && currentGroupedSection.title === section) {
          currentGroupedSection.questions.push(question);
        } else {
          // Save previous grouped section if exists
          if (currentGroupedSection) {
            steps.push(currentGroupedSection);
          }
          currentGroupedSection = { title: section, description, questions: [question] };
        }
      } else {
        // Save any pending grouped section
        if (currentGroupedSection) {
          steps.push(currentGroupedSection);
          currentGroupedSection = null;
        }
        // Each non-grouped question gets its own step
        steps.push({ title: section, description, questions: [question] });
      }
    }

    // Don't forget the last grouped section
    if (currentGroupedSection) {
      steps.push(currentGroupedSection);
    }

    return steps;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !survey) {
    const errorMessage = error instanceof Error ? error.message : 'This survey link is invalid or has expired.';
    const isAlreadyCompleted = errorMessage.includes('already completed') || errorMessage.includes('You have already');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              {isAlreadyCompleted ? (
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              ) : (
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              )}
              <h2 className="text-xl font-semibold mb-2">
                {isAlreadyCompleted ? 'Survey Already Completed' : 'Survey Not Available'}
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
              <div className={`text-sm mt-3 p-3 rounded text-center flex items-center justify-center gap-2 ${saveMessage.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {!saveMessage.includes('Failed') && <CheckCircle2 className="w-4 h-4" />}
                {saveMessage.includes('Failed') && <AlertCircle className="w-4 h-4" />}
                <span>{saveMessage}</span>
              </div>
            )}

            {Object.keys(validationErrors).length > 0 && (
              <p className="text-red-500 text-sm mt-2 text-center">
                Please answer all required questions before continuing.
              </p>
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
            type="number"
            value={(value as string | number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
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
    if (!value || value.length < defaultCount) {
      onChange(Array(defaultCount).fill(''));
    }
  }, [defaultCount]); // eslint-disable-line react-hooks/exhaustive-deps

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

// --- Sortable item for RankOrderInput ---
function SortableRankItem({ id, rank, text, requiresText, textValue, onTextChange, onMoveUp, onMoveDown, isFirst, isLast }: {
  id: string;
  rank: number;
  text: string;
  requiresText?: boolean;
  textValue?: string;
  onTextChange?: (val: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border rounded-lg px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-muted-foreground w-6 text-center">{rank}</span>
        <span className="flex-1 text-base">{text}</span>
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {requiresText && (
        <div className="ml-12 mt-2">
          <input
            type="text"
            placeholder="Please specify..."
            value={textValue || ''}
            onChange={(e) => onTextChange?.(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border rounded-md bg-background"
          />
        </div>
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

  // Extract ranked array and texts from value (handle both legacy and new shapes)
  const ranked = Array.isArray(value) ? value : value?.ranked;
  const texts = Array.isArray(value) ? {} : (value?.texts || {});
  const items = ranked && ranked.length === optionTexts.length ? ranked : optionTexts;

  // Use stable unique IDs for DnD (handles duplicate option texts)
  const itemIds = items.map((_, i) => `rank-${i}`);

  // Build a lookup for requiresText from options
  const requiresTextMap: Record<string, boolean> = {};
  options.forEach((o) => { if (o.requiresText) requiresTextMap[o.text] = true; });

  useEffect(() => {
    if (!ranked || ranked.length !== optionTexts.length) {
      if (hasRequiresText) {
        onChange({ ranked: optionTexts, texts: {} });
      } else {
        onChange(optionTexts);
      }
    }
  }, [optionTexts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const emitChange = (newRanked: string[], newTexts?: Record<string, string>) => {
    if (hasRequiresText) {
      onChange({ ranked: newRanked, texts: newTexts || texts });
    } else {
      onChange(newRanked);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = itemIds.indexOf(active.id as string);
      const newIndex = itemIds.indexOf(over.id as string);
      emitChange(arrayMove(items, oldIndex, newIndex));
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < items.length) {
      emitChange(arrayMove(items, index, newIndex));
    }
  };

  const handleTextChange = (optionText: string, val: string) => {
    emitChange(items, { ...texts, [optionText]: val });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">Drag items or use arrows to rank in order of preference</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item, index) => (
              <SortableRankItem
                key={itemIds[index]}
                id={itemIds[index]}
                rank={index + 1}
                text={item}
                requiresText={requiresTextMap[item]}
                textValue={texts[item]}
                onTextChange={(val) => handleTextChange(item, val)}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
                isFirst={index === 0}
                isLast={index === items.length - 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
