'use client';

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
import { Plus, X, Eye } from 'lucide-react';
import { NOMINATION_TYPE_LABELS, NominationType } from '@kol360/shared';

interface QuestionOption {
  text: string;
  requiresText: boolean;
}

interface Question {
  id: string;
  text: string;
  type: string;
  isRequired: boolean;
  options?: QuestionOption[] | null;
  minEntries?: number | null;
  defaultEntries?: number | null;
  nominationType?: string | null;
}

interface SectionQuestion {
  id: string;
  questionId: string;
  question: Question;
}

interface Section {
  id: string;
  name: string;
  description: string | null;
  questions: SectionQuestion[];
}

interface SectionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: Section | null;
}

export function SectionPreviewDialog({
  open,
  onOpenChange,
  section,
}: SectionPreviewDialogProps) {
  if (!section) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview: {section.name}
          </DialogTitle>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-4 -mx-2">
          <div className="text-sm text-muted-foreground mb-4 text-center">
            This is how the section will appear to survey respondents
          </div>

          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle className="text-base">{section.name}</CardTitle>
              {section.description && (
                <p className="text-sm text-muted-foreground">{section.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {section.questions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No questions in this section
                </div>
              ) : (
                section.questions.map((sq, index) => (
                  <PreviewQuestion
                    key={sq.id}
                    question={sq.question}
                    index={index}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

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
  question: Question;
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
