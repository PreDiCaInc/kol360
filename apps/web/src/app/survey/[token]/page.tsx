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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'RATING' | 'TEXT' | 'MULTI_TEXT';

interface Question {
  id: string;
  questionId: string;
  text: string;
  type: QuestionType;
  section: string | null;
  isRequired: boolean;
  options: string[] | null;
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

  // Initialize answers from saved response
  useEffect(() => {
    if (survey?.response?.answers) {
      setAnswers(survey.response.answers);
      setStarted(true);
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
    // Clear validation error when user answers
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
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const validateAnswers = (): boolean => {
    if (!survey) return false;

    const errors: Record<string, string> = {};

    for (const question of survey.questions) {
      if (question.isRequired) {
        const answer = answers[question.questionId];
        if (
          answer === undefined ||
          answer === null ||
          answer === '' ||
          (Array.isArray(answer) && answer.filter(Boolean).length === 0)
        ) {
          errors[question.questionId] = 'This question is required';
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

  // Error state
  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Survey Not Available</h2>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : 'This survey link is invalid or has expired.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Submitted state
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Survey Submitted</h2>
              <p className="text-muted-foreground">
                Thank you for completing the survey, Dr. {survey.hcp.lastName}.
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
  const answeredQuestions = Object.keys(answers).filter((k) => {
    const answer = answers[k];
    return answer !== undefined && answer !== null && answer !== '' &&
      (!Array.isArray(answer) || answer.filter(Boolean).length > 0);
  }).length;
  const progress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  // Welcome screen
  if (!started) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{survey.campaign.name}</CardTitle>
              <CardDescription>
                Welcome, Dr. {survey.hcp.lastName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Thank you for participating in this survey. Your responses will help us
                better understand key opinion leaders in this field.
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
                  value={answers[question.questionId]}
                  onChange={(value) => updateAnswer(question.questionId, value)}
                  error={validationErrors[question.questionId]}
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
            value={value as string}
            onValueChange={onChange}
            className="space-y-2"
          >
            {question.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                <Label htmlFor={`${question.id}-${option}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'MULTI_CHOICE':
        const selectedOptions = (value as string[]) || [];
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${option}`}
                  checked={selectedOptions.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selectedOptions, option]);
                    } else {
                      onChange(selectedOptions.filter((o) => o !== option));
                    }
                  }}
                />
                <Label htmlFor={`${question.id}-${option}`}>{option}</Label>
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
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter your response..."
            rows={3}
          />
        );

      case 'MULTI_TEXT':
        return <MultiTextInput value={value as string[]} onChange={onChange} />;

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
}

function MultiTextInput({ value, onChange }: MultiTextInputProps) {
  const entries = value || [''];
  const maxEntries = 10;

  const addEntry = () => {
    if (entries.length < maxEntries) {
      onChange([...entries, '']);
    }
  };

  const removeEntry = (index: number) => {
    if (entries.length > 1) {
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
        <div key={index} className="flex gap-2">
          <Input
            value={entry}
            onChange={(e) => updateEntry(index, e.target.value)}
            placeholder={`Name ${index + 1}`}
          />
          {entries.length > 1 && (
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
      {entries.length < maxEntries && (
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="w-4 h-4 mr-1" />
          Add Another
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        You can add up to {maxEntries} names ({entries.length}/{maxEntries})
      </p>
    </div>
  );
}
