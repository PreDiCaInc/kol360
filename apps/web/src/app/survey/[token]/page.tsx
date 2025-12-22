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

  // Initialize answers from saved response
  useEffect(() => {
    if (survey?.response?.answers) {
      setAnswers(survey.response.answers);
      setStarted(true);
    }
  }, [survey]);

  // Mark survey as OPENED when page loads (for tracking purposes)
  useEffect(() => {
    if (survey && !survey.response && !submitted) {
      // Only call startSurvey if there's no existing response yet
      // This creates a response record with OPENED status
      startSurvey.mutate(token, {
        onError: (err) => {
          // Silently ignore errors - this is just for tracking
          console.log('Track survey open:', err);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey, token]);

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
    console.log('updateAnswer called:', questionId, value);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    // Clear validation error when user answers
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const handleSave = async () => {
    console.log('Saving answers:', JSON.stringify(answers, null, 2));
    console.log('Questions:', survey?.questions.map(q => ({ id: q.id, questionId: q.questionId, type: q.type, text: q.text.substring(0, 30) })));
    try {
      await saveProgress.mutateAsync({ token, answers });
      setLastSaved(new Date());
      setSaveMessage('Your progress has been saved. You can use this link to come back and finish later.');
      // Clear message after 8 seconds
      setTimeout(() => setSaveMessage(null), 8000);
    } catch (err) {
      console.error('Failed to save:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setSaveMessage(`Failed to save: ${errorMessage}`);
      setTimeout(() => setSaveMessage(null), 8000);
    }
  };

  const validateAnswers = (): boolean => {
    if (!survey) return false;

    const errors: Record<string, string> = {};

    for (const question of survey.questions) {
      const answer = answers[question.id];

      // Check if required question has an answer
      if (question.isRequired) {
        if (
          answer === undefined ||
          answer === null ||
          answer === '' ||
          (Array.isArray(answer) && answer.filter(Boolean).length === 0)
        ) {
          errors[question.id] = 'This question is required';
          continue;
        }
      }

      // For MULTI_TEXT questions, enforce minEntries
      if (question.type === 'MULTI_TEXT' && question.minEntries && question.minEntries > 1) {
        const filledEntries = Array.isArray(answer) ? answer.filter(Boolean).length : 0;
        if (filledEntries < question.minEntries) {
          errors[question.id] = `Please provide at least ${question.minEntries} names`;
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAnswers()) {
      return;
    }

    try {
      await submitSurvey.mutateAsync({ token, answers });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit:', err);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state - check if already completed (use success styling)
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

  // Group questions by section
  const sections = survey.questions.reduce(
    (acc, q) => {
      const section = q.section || 'General';
      if (!acc[section]) acc[section] = [];
      acc[section].push(q);
      return acc;
    },
    {} as Record<string, Question[]>
  );

  const sectionNames = Object.keys(sections);
  const totalQuestions = survey.questions.length;
  const answeredQuestions = survey.questions.filter((q) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === null || answer === '') return false;
    // Handle MULTI_TEXT (array of strings)
    if (Array.isArray(answer)) {
      return answer.filter(Boolean).length > 0;
    }
    // Handle SINGLE_CHOICE / MULTI_CHOICE (object with selected property)
    if (typeof answer === 'object' && answer !== null) {
      const obj = answer as { selected?: string | string[] };
      if ('selected' in obj) {
        if (Array.isArray(obj.selected)) {
          return obj.selected.length > 0;
        }
        return obj.selected !== undefined && obj.selected !== '';
      }
    }
    // Handle NUMBER, TEXT, DROPDOWN, RATING (primitive values)
    return true;
  }).length;
  const progress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  // Welcome screen
  if (!started) {
    const welcomeTitle = survey.campaign.surveyWelcomeTitle || survey.campaign.name;
    const welcomeMessage = survey.campaign.surveyWelcomeMessage ||
      'Thank you for participating in this survey. Your responses will help us better understand key opinion leaders in this field.';

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{welcomeTitle}</CardTitle>
              <CardDescription>
                Welcome, Dr. {survey.hcp.lastName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {welcomeMessage}
              </p>
              {survey.campaign.honorariumAmount && (
                <p className="text-sm bg-green-50 text-green-800 p-3 rounded-md">
                  Upon completion, you will receive a ${survey.campaign.honorariumAmount} honorarium.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                This survey contains {totalQuestions} questions across {sectionNames.length} section(s).
                Your progress will be saved automatically.
              </p>
              <Button onClick={handleStart} className="w-full" disabled={startSurvey.isPending}>
                {startSurvey.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Begin Survey
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{survey.campaign.name}</CardTitle>
            <CardDescription>Dr. {survey.hcp.lastName}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{answeredQuestions} of {totalQuestions} questions answered</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {lastSaved && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Save className="w-3 h-3" />
                Last saved: {lastSaved.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Questions by section */}
        {sectionNames.map((sectionName) => (
          <Card key={sectionName}>
            <CardHeader>
              <CardTitle className="text-base">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {sections[sectionName].map((question, idx) => (
                <QuestionRenderer
                  key={question.id}
                  question={question}
                  index={idx}
                  value={answers[question.id]}
                  onChange={(value) => updateAnswer(question.id, value)}
                  error={validationErrors[question.id]}
                />
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saveProgress.isPending}
                className="flex-1"
              >
                {saveProgress.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Progress
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitSurvey.isPending}
                className="flex-1"
              >
                {submitSurvey.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Submit Survey
              </Button>
            </div>
            {saveMessage && (
              <div className={`text-sm mt-3 p-3 rounded text-center flex items-center justify-center gap-2 ${saveMessage.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {!saveMessage.includes('Failed') && <CheckCircle2 className="w-4 h-4" />}
                {saveMessage.includes('Failed') && <AlertCircle className="w-4 h-4" />}
                <span>{saveMessage}</span>
              </div>
            )}
            {Object.keys(validationErrors).length > 0 && (
              <p className="text-red-500 text-sm mt-2 text-center">
                Please answer all required questions before submitting.
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
}

function QuestionRenderer({ question, index, value, onChange, error }: QuestionRendererProps) {
  const renderInput = () => {
    switch (question.type) {
      case 'SINGLE_CHOICE':
        return (
          <RadioGroup
            value={(value as { selected: string; text?: string })?.selected || (value as string)}
            onValueChange={(selected) => onChange({ selected, text: '' })}
            className="space-y-2"
          >
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-center gap-2">
                <RadioGroupItem value={option.text} id={`${question.id}-${option.text}`} />
                <Label htmlFor={`${question.id}-${option.text}`}>{option.text}</Label>
                {option.requiresText && (value as { selected: string })?.selected === option.text && (
                  <Input
                    placeholder="Please specify..."
                    className="flex-1 max-w-xs"
                    value={(value as { selected: string; text?: string })?.text || ''}
                    onChange={(e) => onChange({ selected: option.text, text: e.target.value })}
                  />
                )}
              </div>
            ))}
          </RadioGroup>
        );

      case 'MULTI_CHOICE':
        const selectedOptions = (value as { selected: string[]; texts?: Record<string, string> }) || { selected: [], texts: {} };
        const selected = Array.isArray(value) ? value : selectedOptions.selected || [];
        const texts = selectedOptions.texts || {};
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-center gap-2">
                <Checkbox
                  id={`${question.id}-${option.text}`}
                  checked={selected.includes(option.text)}
                  onCheckedChange={(checked) => {
                    const newSelected = checked
                      ? [...selected, option.text]
                      : selected.filter((o) => o !== option.text);
                    onChange({ selected: newSelected, texts });
                  }}
                />
                <Label htmlFor={`${question.id}-${option.text}`}>{option.text}</Label>
                {option.requiresText && selected.includes(option.text) && (
                  <Input
                    placeholder="Please specify..."
                    className="flex-1 max-w-xs"
                    value={texts[option.text] || ''}
                    onChange={(e) => onChange({ selected, texts: { ...texts, [option.text]: e.target.value } })}
                  />
                )}
              </div>
            ))}
          </div>
        );

      case 'RATING':
        const ratingValue = value as number;
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant={ratingValue === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => onChange(n)}
                className="w-10 h-10"
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
            className="max-w-xs"
          />
        );

      case 'DROPDOWN':
        return (
          <Select
            value={(value as string) || ''}
            onValueChange={(val) => onChange(val)}
          >
            <SelectTrigger className="max-w-xs">
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <span className="text-muted-foreground">{index + 1}.</span>
        <div className="flex-1">
          <p className="font-medium">
            {question.text}
            {question.isRequired && <span className="text-red-500 ml-1">*</span>}
          </p>
        </div>
      </div>
      {renderInput()}
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

  // Initialize with defaultEntries number of empty strings if no value or if array is too short
  const entries = (value && value.length >= defaultCount) ? value : Array(defaultCount).fill('');

  // Initialize parent state with default entries on mount
  useEffect(() => {
    if (!value || value.length < defaultCount) {
      onChange(Array(defaultCount).fill(''));
    }
  }, [defaultCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = () => {
    onChange([...entries, '']);
  };

  const removeEntry = (index: number) => {
    // Don't allow removing below minEntries
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
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Input
            value={entry}
            onChange={(e) => updateEntry(index, e.target.value)}
            placeholder={`Name ${index + 1}`}
          />
          {index < minRequired && (
            <span className="text-red-500 text-sm">*</span>
          )}
          {entries.length > minRequired && index >= minRequired && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeEntry(index)}
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
