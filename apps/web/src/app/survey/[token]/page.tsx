'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  useSurvey,
  useStartSurvey,
  useSaveProgress,
  useSubmitSurvey,
} from '@/hooks/use-survey-taking';
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'RATING' | 'TEXT' | 'MULTI_TEXT' | 'NUMBER' | 'DROPDOWN';

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

    const steps = buildSteps(survey!.questions);
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

    try {
      await submitSurvey.mutateAsync({ token, answers });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit:', err);
    }
  };

  // Build steps from questions - group certain sections, show others one at a time
  const buildSteps = (questions: Question[]): { title: string; questions: Question[] }[] => {
    const steps: { title: string; questions: Question[] }[] = [];
    let currentGroupedSection: { title: string; questions: Question[] } | null = null;

    for (const question of questions) {
      const section = question.section || 'General';
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
          currentGroupedSection = { title: section, questions: [question] };
        }
      } else {
        // Save any pending grouped section
        if (currentGroupedSection) {
          steps.push(currentGroupedSection);
          currentGroupedSection = null;
        }
        // Each non-grouped question gets its own step
        steps.push({ title: section, questions: [question] });
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

  // Submitted state
  if (submitted) {
    const thankYouTitle = survey.campaign.surveyThankYouTitle || 'Thank You!';
    const thankYouMessage = survey.campaign.surveyThankYouMessage ||
      `Thank you for completing the survey, Dr. ${survey.hcp.lastName}.`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">{thankYouTitle}</h2>
              <p className="text-muted-foreground">
                {thankYouMessage}
              </p>
              {survey.campaign.honorariumAmount && (
                <p className="mt-4 text-sm">
                  Your ${survey.campaign.honorariumAmount} honorarium will be processed shortly.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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

  // Welcome screen - uses same layout as login page
  if (!started) {
    const welcomeTitle = survey.campaign.surveyWelcomeTitle || survey.campaign.name;
    const welcomeMessage = survey.campaign.surveyWelcomeMessage ||
      'Thank you for participating in this survey. Your responses will help us better understand key opinion leaders in this field.';

    return (
      <div className="min-h-screen flex">
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(187,85%,25%)] via-[hsl(187,80%,30%)] to-[hsl(200,75%,20%)]" />
          <div className="absolute inset-0 opacity-10">
            <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between p-12 text-white">
            <div>
              <img
                src="/images/logo-white.png"
                alt="BioExec"
                className="h-36 w-auto object-contain"
              />
            </div>

            <div className="max-w-md">
              <h1 className="text-4xl xl:text-5xl font-semibold leading-tight tracking-tight mb-6">
                KOL360
              </h1>
              <p className="text-xl text-white/80 leading-relaxed mb-8">
                The comprehensive platform for Key Opinion Leader identification, assessment, and engagement analytics.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>National Leaders</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Peer Advisors</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Rising Stars and more</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-white/40">
                © {new Date().getFullYear()} Bio-Exec KOL Research. All rights reserved.
              </p>
              <p className="text-xs text-white/25">
                Powered by{' '}
                <a
                  href="https://predica.care"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/40 transition-colors"
                >
                  PreDiCa.care
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Welcome Content */}
        <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
                  <span className="text-sm font-bold text-white">K3</span>
                </div>
                <span className="text-xl font-semibold">KOL360</span>
              </div>
            </div>

            <Card className="border-0 shadow-xl shadow-black/5 bg-card/80 backdrop-blur-sm">
              <CardHeader className="space-y-1 pb-6">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  {welcomeTitle}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Welcome, Dr. {survey.hcp.lastName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-muted-foreground leading-relaxed">
                  {welcomeMessage}
                </p>
                {survey.campaign.honorariumAmount && (
                  <div className="flex items-start gap-3 p-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>
                      Upon completion, you will receive a ${survey.campaign.honorariumAmount} honorarium.
                    </span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  This survey contains {totalQuestions} questions.
                  Your progress will be saved automatically.
                </p>
                <Button onClick={handleStart} className="w-full h-11 text-base font-medium" size="lg" disabled={startSurvey.isPending}>
                  {startSurvey.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Begin Survey
                </Button>
              </CardContent>
            </Card>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground mt-8">
              Protected by enterprise-grade security. Need help?{' '}
              <a href="mailto:support@bio-exec.com" className="text-primary hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </div>
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
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium">{currentStepData.title}</span>
                <span className="text-muted-foreground">
                  Step {currentStep + 1} of {totalSteps}
                </span>
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

  const removeEntry = (index: number) => {
    if (entries.length > minRequired) {
      onChange(entries.filter((_, i) => i !== index));
    }
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
          {entries.length > minRequired && index >= minRequired && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeEntry(index)}
              className="shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
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
