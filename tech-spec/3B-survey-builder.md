# Module 3B: Survey Builder (Templates)

## Objective
Build section templates and survey templates for reusable survey structures.

## Prerequisites
- Module 3A completed

---

## Architecture

```
Questions (from Question Bank)
    ↓
Section Templates (group questions)
    ↓
Survey Templates (combine sections)
    ↓
Campaign Survey (clone of template with frozen question text)
```

---

## API Endpoints

### Section Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sections` | List section templates |
| GET | `/api/v1/sections/:id` | Get section with questions |
| POST | `/api/v1/sections` | Create section |
| PUT | `/api/v1/sections/:id` | Update section |
| POST | `/api/v1/sections/:id/questions` | Add question to section |
| PUT | `/api/v1/sections/:id/questions/reorder` | Reorder questions |
| DELETE | `/api/v1/sections/:id/questions/:questionId` | Remove question |

### Survey Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/survey-templates` | List templates |
| GET | `/api/v1/survey-templates/:id` | Get template with sections |
| POST | `/api/v1/survey-templates` | Create template |
| PUT | `/api/v1/survey-templates/:id` | Update template |
| POST | `/api/v1/survey-templates/:id/sections` | Add section |
| PUT | `/api/v1/survey-templates/:id/sections/reorder` | Reorder sections |
| DELETE | `/api/v1/survey-templates/:id/sections/:sectionId` | Remove section |
| POST | `/api/v1/survey-templates/:id/clone` | Clone template |

---

## Backend Implementation

### Section Service

`apps/api/src/services/section.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class SectionService {
  async list() {
    return prisma.sectionTemplate.findMany({
      include: {
        questions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { templateSections: true } },
      },
      orderBy: [{ isCore: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getById(id: string) {
    return prisma.sectionTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          include: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async create(data: { name: string; description?: string; isCore?: boolean }) {
    const maxOrder = await prisma.sectionTemplate.aggregate({
      _max: { sortOrder: true },
    });
    
    return prisma.sectionTemplate.create({
      data: {
        ...data,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    return prisma.sectionTemplate.update({
      where: { id },
      data,
    });
  }

  async addQuestion(sectionId: string, questionId: string) {
    const maxOrder = await prisma.sectionQuestion.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });

    return prisma.sectionQuestion.create({
      data: {
        sectionId,
        questionId,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });
  }

  async removeQuestion(sectionId: string, questionId: string) {
    return prisma.sectionQuestion.deleteMany({
      where: { sectionId, questionId },
    });
  }

  async reorderQuestions(sectionId: string, questionIds: string[]) {
    const updates = questionIds.map((questionId, index) =>
      prisma.sectionQuestion.updateMany({
        where: { sectionId, questionId },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
  }
}
```

### Survey Template Service

`apps/api/src/services/survey-template.service.ts`:

```typescript
import { prisma } from '../lib/prisma';

export class SurveyTemplateService {
  async list() {
    return prisma.surveyTemplate.findMany({
      include: {
        sections: {
          include: {
            section: {
              include: {
                questions: {
                  include: { question: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { campaigns: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return prisma.surveyTemplate.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            section: {
              include: {
                questions: {
                  include: { question: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async create(data: { name: string; description?: string }) {
    return prisma.surveyTemplate.create({ data });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    return prisma.surveyTemplate.update({ where: { id }, data });
  }

  async addSection(templateId: string, sectionId: string, isLocked = false) {
    const maxOrder = await prisma.templateSection.aggregate({
      where: { templateId },
      _max: { sortOrder: true },
    });

    return prisma.templateSection.create({
      data: {
        templateId,
        sectionId,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
        isLocked,
      },
    });
  }

  async removeSection(templateId: string, sectionId: string) {
    return prisma.templateSection.deleteMany({
      where: { templateId, sectionId },
    });
  }

  async reorderSections(templateId: string, sectionIds: string[]) {
    const updates = sectionIds.map((sectionId, index) =>
      prisma.templateSection.updateMany({
        where: { templateId, sectionId },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
  }

  async clone(id: string, newName: string) {
    const template = await this.getById(id);
    if (!template) throw new Error('Template not found');

    return prisma.surveyTemplate.create({
      data: {
        name: newName,
        description: template.description,
        sections: {
          create: template.sections.map((ts) => ({
            sectionId: ts.sectionId,
            sortOrder: ts.sortOrder,
            isLocked: ts.isLocked,
          })),
        },
      },
      include: {
        sections: { include: { section: true } },
      },
    });
  }

  // Used when assigning template to campaign
  async instantiateForCampaign(templateId: string, campaignId: string) {
    const template = await this.getById(templateId);
    if (!template) throw new Error('Template not found');

    const surveyQuestions = [];
    let globalOrder = 0;

    for (const templateSection of template.sections) {
      for (const sectionQuestion of templateSection.section.questions) {
        surveyQuestions.push({
          campaignId,
          questionId: sectionQuestion.questionId,
          sectionName: templateSection.section.name,
          sortOrder: globalOrder++,
          isRequired: sectionQuestion.question.isRequired,
          questionTextSnapshot: sectionQuestion.question.text, // Freeze text
        });
      }
    }

    await prisma.surveyQuestion.createMany({ data: surveyQuestions });

    // Increment usage count
    const questionIds = surveyQuestions.map((q) => q.questionId);
    await prisma.question.updateMany({
      where: { id: { in: questionIds } },
      data: { usageCount: { increment: 1 } },
    });
  }
}
```

---

## Frontend Implementation

### Survey Template Builder

`apps/web/src/app/admin/survey-templates/[id]/page.tsx`:

Key features:
- Drag & drop section reordering
- Add/remove sections from template
- Preview full survey
- Clone template button

### Section Builder

`apps/web/src/app/admin/sections/[id]/page.tsx`:

Key features:
- Drag & drop question reordering
- Add questions from question bank (modal search)
- Remove questions
- Core section indicator (cannot delete)

---

## Core Sections (Seeded)

These are created in the seed script and marked as `isCore: true`:

1. **Demographics** - Basic physician info
2. **National Advisors** - National KOL nominations
3. **Local Advisors** - Regional KOL nominations  
4. **Rising Stars** - Emerging leader nominations

Core sections cannot be deleted but can be customized by adding/removing questions.

---

## Acceptance Criteria

- [ ] Create/edit section templates
- [ ] Add/remove questions from sections
- [ ] Reorder questions via drag & drop
- [ ] Create/edit survey templates
- [ ] Add/remove sections from templates
- [ ] Reorder sections via drag & drop
- [ ] Clone survey templates
- [ ] Core sections protected from deletion
- [ ] Question text frozen when assigned to campaign

---

## Next Module
→ `4A-composite-score-config.md` - Score weight configuration
