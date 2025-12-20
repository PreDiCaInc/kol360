'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createQuestionSchema, CreateQuestionInput, QUESTION_TAGS } from '@kol360/shared';
import { useQuestion, useCreateQuestion, useUpdateQuestion } from '@/hooks/use-questions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';

const questionTypes = [
  { value: 'TEXT', label: 'Text', hasOptions: false },
  { value: 'NUMBER', label: 'Number', hasOptions: false },
  { value: 'RATING', label: 'Rating', hasOptions: false },
  { value: 'SINGLE_CHOICE', label: 'Radio', hasOptions: true },
  { value: 'MULTI_CHOICE', label: 'Check Multiple', hasOptions: true },
  { value: 'DROPDOWN', label: 'Dropdown', hasOptions: true },
  { value: 'MULTI_TEXT', label: 'Nominations', hasOptions: false },
];

interface QuestionOption {
  text: string;
  requiresText: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId?: string;
}

export function QuestionFormDialog({ open, onOpenChange, questionId }: Props) {
  const isEdit = !!questionId;
  const { data: question } = useQuestion(questionId || '');
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();

  const [options, setOptions] = useState<QuestionOption[]>([
    { text: '', requiresText: false },
    { text: '', requiresText: false },
  ]);

  const form = useForm<CreateQuestionInput>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: '',
      type: 'TEXT',
      category: '',
      isRequired: false,
      options: [],
      tags: [],
      minEntries: null,
      defaultEntries: null,
    },
  });

  const selectedType = form.watch('type');
  const currentTags = form.watch('tags') || [];
  const needsOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(selectedType);
  const isNominations = selectedType === 'MULTI_TEXT';

  useEffect(() => {
    if (question) {
      // Parse options - handle both old string[] format and new object format
      let parsedOptions: QuestionOption[] = [
        { text: '', requiresText: false },
        { text: '', requiresText: false },
      ];
      if (question.options?.length) {
        parsedOptions = question.options.map((opt: string | QuestionOption) => {
          if (typeof opt === 'string') {
            return { text: opt, requiresText: false };
          }
          return opt;
        });
      }

      form.reset({
        text: question.text,
        type: question.type as CreateQuestionInput['type'],
        category: question.category || '',
        isRequired: question.isRequired,
        options: question.options || [],
        tags: question.tags || [],
        minEntries: question.minEntries ?? null,
        defaultEntries: question.defaultEntries ?? null,
      });
      setOptions(parsedOptions);
    } else if (!questionId) {
      form.reset({
        text: '',
        type: 'TEXT',
        category: '',
        isRequired: false,
        options: [],
        tags: [],
        minEntries: null,
        defaultEntries: null,
      });
      setOptions([
        { text: '', requiresText: false },
        { text: '', requiresText: false },
      ]);
    }
  }, [question, questionId, form]);

  // Sync options with form - store as objects with requiresText flag
  useEffect(() => {
    if (needsOptions) {
      const validOptions = options.filter((opt) => opt.text.trim());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setValue('options', validOptions as any);
    } else {
      form.setValue('options', []);
    }
  }, [options, needsOptions, form]);

  async function onSubmit(data: CreateQuestionInput) {
    console.log('Submitting question:', data);
    try {
      if (isEdit) {
        await updateQuestion.mutateAsync({ id: questionId!, data });
      } else {
        await createQuestion.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
      setOptions([
        { text: '', requiresText: false },
        { text: '', requiresText: false },
      ]);
    } catch (error) {
      console.error('Failed to save question:', error);
    }
  }

  function onInvalid(errors: unknown) {
    console.log('Form validation failed:', errors);
  }

  function addOption() {
    setOptions([...options, { text: '', requiresText: false }]);
  }

  function removeOption(index: number) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  function updateOptionText(index: number, value: string) {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text: value };
    setOptions(newOptions);
  }

  function toggleOptionRequiresText(index: number) {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], requiresText: !newOptions[index].requiresText };
    setOptions(newOptions);
  }

  function toggleTag(tag: string) {
    if (currentTags.includes(tag)) {
      form.setValue('tags', currentTags.filter((t) => t !== tag));
    } else {
      form.setValue('tags', [...currentTags, tag]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Text</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter the question text..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {questionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        placeholder="e.g., Demographics"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <FormLabel>Options (minimum 2 required)</FormLabel>
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option.text}
                      onChange={(e) => updateOptionText(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                      <Checkbox
                        checked={option.requiresText}
                        onCheckedChange={() => toggleOptionRequiresText(index)}
                      />
                      + Text
                    </label>
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Option
                </Button>
                <FormField
                  control={form.control}
                  name="options"
                  render={() => <FormMessage />}
                />
              </div>
            )}

            {/* Nominations settings */}
            {isNominations && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minEntries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Required</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 3"
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val ? parseInt(val, 10) : null);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultEntries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Boxes</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g., 5"
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val ? parseInt(val, 10) : null);
                          }}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        User can add more with +
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <FormLabel>Tags</FormLabel>
              <div className="flex gap-2 flex-wrap">
                {QUESTION_TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={currentTags.includes(tag) ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/80 transition-colors"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              {currentTags.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {currentTags.join(', ')}
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Required question</FormLabel>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createQuestion.isPending || updateQuestion.isPending}
              >
                {createQuestion.isPending || updateQuestion.isPending
                  ? 'Saving...'
                  : isEdit
                  ? 'Update'
                  : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
