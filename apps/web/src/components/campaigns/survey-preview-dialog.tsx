'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X, Eye, Loader2, FileQuestion } from 'lucide-react';
import { useSurveyPreview, SurveyPreviewQuestion } from '@/hooks/use-campaigns';
import { NOMINATION_TYPE_LABELS, NominationType } from '@kol360/shared';

interface SurveyPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

export function SurveyPreviewDialog({
  open,
  onOpenChange,
  campaignId,
}: SurveyPreviewDialogProps) {
  const { data: preview, isLoading } = useSurveyPreview(campaignId);
  const [currentView, setCurrentView] = useState<'welcome' | 'survey' | 'thankyou'>('welcome');

  if (!open) return null;

  const renderWelcome = () => (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>{preview?.welcomeTitle || preview?.campaignName || 'Survey'}</CardTitle>
        <CardDescription>Welcome, Dr. [Respondent Name]</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          {preview?.welcomeMessage ||
            'Thank you for participating in this survey. Your responses will help us better understand key opinion leaders in this field.'}
        </p>
        {preview?.honorariumAmount && (
          <p className="text-sm bg-green-50 text-green-800 p-3 rounded-md">
            Upon completion, you will receive a ${preview.honorariumAmount} honorarium.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          This survey contains {preview?.totalQuestions || 0} questions across {Object.keys(preview?.sections || {}).length} section(s).
          Your progress will be saved automatically.
        </p>
        <Button className="w-full" onClick={() => setCurrentView('survey')}>
          Begin Survey
        </Button>
      </CardContent>
    </Card>
  );

  const renderThankYou = () => (
    <Card className="max-w-md mx-auto">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {preview?.thankYouTitle || 'Thank You!'}
          </h2>
          <p className="text-muted-foreground">
            {preview?.thankYouMessage ||
              'Thank you for completing the survey, Dr. [Respondent Name].'}
          </p>
          {preview?.honorariumAmount && (
            <p className="mt-4 text-sm">
              Your ${preview.honorariumAmount} honorarium will be processed shortly.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderSurvey = () => {
    const sectionNames = Object.keys(preview?.sections || {});

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Progress Header */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{preview?.campaignName}</CardTitle>
            <CardDescription>Dr. [Respondent Name]</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>0 of {preview?.totalQuestions} questions answered</span>
                <span>0%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full w-0" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions by Section */}
        {sectionNames.map((sectionName) => (
          <Card key={sectionName}>
            <CardHeader>
              <CardTitle className="text-base">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {preview?.sections[sectionName].map((question, idx) => (
                <PreviewQuestion
                  key={question.id}
                  question={question}
                  index={idx}
                />
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" disabled>
                Save Progress
              </Button>
              <Button className="flex-1" onClick={() => setCurrentView('thankyou')}>
                Submit Survey
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Survey Preview
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !preview || preview.totalQuestions === 0 ? (
          <div className="text-center py-12">
            <FileQuestion className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No survey questions</h3>
            <p className="text-muted-foreground">
              This campaign doesn&apos;t have any survey questions yet.
              Assign a survey template to add questions.
            </p>
          </div>
        ) : (
          <>
            {/* View Toggle */}
            <div className="flex justify-center gap-2 mb-4">
              <Button
                variant={currentView === 'welcome' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentView('welcome')}
              >
                Welcome
              </Button>
              <Button
                variant={currentView === 'survey' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentView('survey')}
              >
                Survey ({preview.totalQuestions} questions)
              </Button>
              <Button
                variant={currentView === 'thankyou' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentView('thankyou')}
              >
                Thank You
              </Button>
            </div>

            {/* Preview Content */}
            <div className="bg-gray-50 rounded-lg p-4 -mx-2">
              <div className="text-xs text-muted-foreground mb-4 text-center">
                Preview Mode - This is how the survey will appear to respondents
              </div>

              {currentView === 'welcome' && renderWelcome()}
              {currentView === 'survey' && renderSurvey()}
              {currentView === 'thankyou' && renderThankYou()}
            </div>
          </>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close Preview
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PreviewQuestionProps {
  question: SurveyPreviewQuestion;
  index: number;
}

function PreviewQuestion({ question, index }: PreviewQuestionProps) {
  const renderInput = () => {
    switch (question.type) {
      case 'SINGLE_CHOICE':
        return (
          <RadioGroup className="space-y-2" disabled>
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-center gap-2">
                <RadioGroupItem value={option.text} id={`preview-${question.id}-${option.text}`} disabled />
                <Label htmlFor={`preview-${question.id}-${option.text}`} className="text-sm font-normal">
                  {option.text}
                </Label>
                {option.requiresText && (
                  <Input
                    placeholder="Please specify..."
                    className="flex-1 max-w-xs h-8 text-sm"
                    disabled
                  />
                )}
              </div>
            ))}
          </RadioGroup>
        );

      case 'MULTI_CHOICE':
        return (
          <div className="space-y-2">
            {question.options?.map((option) => (
              <div key={option.text} className="flex items-center gap-2">
                <Checkbox id={`preview-${question.id}-${option.text}`} disabled />
                <Label htmlFor={`preview-${question.id}-${option.text}`} className="text-sm font-normal">
                  {option.text}
                </Label>
                {option.requiresText && (
                  <Input
                    placeholder="Please specify..."
                    className="flex-1 max-w-xs h-8 text-sm"
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        );

      case 'RATING':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant="outline"
                size="sm"
                className="w-10 h-10"
                disabled
              >
                {n}
              </Button>
            ))}
          </div>
        );

      case 'TEXT':
        return (
          <Input
            placeholder="Enter your response..."
            disabled
            className="max-w-md"
          />
        );

      case 'MULTI_TEXT':
        const defaultCount = question.defaultEntries ?? question.minEntries ?? 3;
        return (
          <div className="space-y-2">
            {Array.from({ length: Math.min(defaultCount, 5) }).map((_, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder={`Name ${i + 1}`}
                  disabled
                  className="max-w-md"
                />
                {i < (question.minEntries ?? 1) && (
                  <span className="text-red-500 text-sm">*</span>
                )}
                {i >= (question.minEntries ?? 1) && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled>
              <Plus className="w-4 h-4 mr-1" />
              Add Another
            </Button>
            {(question.minEntries ?? 0) > 1 && (
              <p className="text-xs text-muted-foreground">
                * Minimum {question.minEntries} names required
              </p>
            )}
          </div>
        );

      case 'NUMBER':
        return (
          <Input
            type="number"
            placeholder="Enter a number..."
            disabled
            className="max-w-xs"
          />
        );

      case 'DROPDOWN':
        return (
          <Select disabled>
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
        <span className="text-muted-foreground text-sm">{index + 1}.</span>
        <div className="flex-1">
          <p className="text-sm font-medium">
            {question.text}
            {question.isRequired && <span className="text-red-500 ml-1">*</span>}
          </p>
          {question.nominationType && (
            <Badge variant="outline" className="mt-1 text-xs">
              {NOMINATION_TYPE_LABELS[question.nominationType as NominationType] || question.nominationType}
            </Badge>
          )}
        </div>
      </div>
      {renderInput()}
    </div>
  );
}
