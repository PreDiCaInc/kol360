'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createQuestionSchema, CreateQuestionInput } from '@kol360/shared';
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
  { value: 'RATING', label: 'Rating (1-5)', hasOptions: false },
  { value: 'SINGLE_CHOICE', label: 'Single Choice', hasOptions: true },
  { value: 'MULTI_CHOICE', label: 'Multi Choice', hasOptions: true },
  { value: 'DROPDOWN', label: 'Dropdown', hasOptions: true },
  { value: 'MULTI_TEXT', label: 'Multi Text (Nominations)', hasOptions: false },
];

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

  const [options, setOptions] = useState<string[]>(['', '']);
  const [tagInput, setTagInput] = useState('');

  const form = useForm<CreateQuestionInput>({
    resolver: zodResolver(createQuestionSchema),
    defaultValues: {
      text: '',
      type: 'TEXT',
      category: '',
      isRequired: false,
      options: [],
      tags: [],
    },
  });

  const selectedType = form.watch('type');
  const currentTags = form.watch('tags') || [];
  const needsOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN'].includes(selectedType);

  useEffect(() => {
    if (question) {
      form.reset({
        text: question.text,
        type: question.type as CreateQuestionInput['type'],
        category: question.category || '',
        isRequired: question.isRequired,
        options: question.options || [],
        tags: question.tags || [],
      });
      setOptions(question.options?.length ? question.options : ['', '']);
    } else if (!questionId) {
      form.reset({
        text: '',
        type: 'TEXT',
        category: '',
        isRequired: false,
        options: [],
        tags: [],
      });
      setOptions(['', '']);
    }
  }, [question, questionId, form]);

  // Sync options with form
  useEffect(() => {
    if (needsOptions) {
      form.setValue('options', options.filter(Boolean));
    } else {
      form.setValue('options', []);
    }
  }, [options, needsOptions, form]);

  async function onSubmit(data: CreateQuestionInput) {
    try {
      if (isEdit) {
        await updateQuestion.mutateAsync({ id: questionId!, data });
      } else {
        await createQuestion.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
      setOptions(['', '']);
      setTagInput('');
    } catch (error) {
      console.error('Failed to save question:', error);
    }
  }

  function addOption() {
    setOptions([...options, '']);
  }

  function removeOption(index: number) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  function updateOption(index: number, value: string) {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !currentTags.includes(tag)) {
      form.setValue('tags', [...currentTags, tag]);
      setTagInput('');
    }
  }

  function removeTag(tag: string) {
    form.setValue('tags', currentTags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                    />
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

            {/* Tags */}
            <div className="space-y-2">
              <FormLabel>Tags</FormLabel>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add a tag..."
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {currentTags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {currentTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
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
