import { FastifyPluginAsync } from 'fastify';
import { LiteClientService } from '../services/lite-client.service';
import { z } from 'zod';

const liteClientService = new LiteClientService();

// Schemas
const hcpScoresQuerySchema = z.object({
  search: z.string().optional(),
  specialty: z.string().optional(),
  state: z.string().optional(),
  minCompositeScore: z.coerce.number().optional(),
  maxCompositeScore: z.coerce.number().optional(),
  sortBy: z.enum(['compositeScore', 'lastName', 'specialty', 'state']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const grantAccessSchema = z.object({
  diseaseAreaId: z.string(),
  expiresAt: z.string().datetime().optional(),
});

interface ExportRow {
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string;
  subSpecialty: string;
  city: string;
  state: string;
  yearsInPractice: string | number;
  diseaseArea: string;
  scorePublications: string | number;
  scoreClinicalTrials: string | number;
  scoreTradePubs: string | number;
  scoreOrgLeadership: string | number;
  scoreOrgAwareness: string | number;
  scoreConference: string | number;
  scoreSocialMedia: string | number;
  scoreMediaPodcasts: string | number;
  scoreSurvey: string | number;
  compositeScore: string | number;
  nominationCount: number;
}

export const liteClientRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================
  // LITE CLIENT ROUTES (requires authentication)
  // ==========================================

  // Get assigned disease areas for current lite client
  fastify.get('/api/v1/lite/disease-areas', async (request, reply) => {
    const user = request.user;

    if (!user?.tenantId) {
      return reply.status(403).send({ error: 'No tenant associated with user' });
    }

    try {
      const diseaseAreas = await liteClientService.getAssignedDiseaseAreas(user.tenantId);
      return diseaseAreas;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch disease areas';
      return reply.status(500).send({ error: message });
    }
  });

  // Get HCP scores for a specific disease area
  fastify.get<{
    Params: { diseaseAreaId: string };
    Querystring: z.infer<typeof hcpScoresQuerySchema>;
  }>('/api/v1/lite/disease-areas/:diseaseAreaId/scores', async (request, reply) => {
    const user = request.user;
    const { diseaseAreaId } = request.params;

    if (!user?.tenantId) {
      return reply.status(403).send({ error: 'No tenant associated with user' });
    }

    try {
      const query = hcpScoresQuerySchema.parse(request.query);
      const result = await liteClientService.getHcpScores(user.tenantId, {
        diseaseAreaId,
        ...query,
      });
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Access denied')) {
        return reply.status(403).send({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch HCP scores';
      return reply.status(500).send({ error: message });
    }
  });

  // Get disease area statistics
  fastify.get<{
    Params: { diseaseAreaId: string };
  }>('/api/v1/lite/disease-areas/:diseaseAreaId/stats', async (request, reply) => {
    const user = request.user;
    const { diseaseAreaId } = request.params;

    if (!user?.tenantId) {
      return reply.status(403).send({ error: 'No tenant associated with user' });
    }

    try {
      const stats = await liteClientService.getDiseaseAreaStats(user.tenantId, diseaseAreaId);
      return stats;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Access denied')) {
        return reply.status(403).send({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch statistics';
      return reply.status(500).send({ error: message });
    }
  });

  // Get top KOLs for a disease area
  fastify.get<{
    Params: { diseaseAreaId: string };
    Querystring: { limit?: string };
  }>('/api/v1/lite/disease-areas/:diseaseAreaId/top-kols', async (request, reply) => {
    const user = request.user;
    const { diseaseAreaId } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;

    if (!user?.tenantId) {
      return reply.status(403).send({ error: 'No tenant associated with user' });
    }

    try {
      const topKols = await liteClientService.getTopKols(user.tenantId, diseaseAreaId, limit);
      return topKols;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Access denied')) {
        return reply.status(403).send({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch top KOLs';
      return reply.status(500).send({ error: message });
    }
  });

  // Export HCP scores as CSV
  fastify.get<{
    Params: { diseaseAreaId: string };
  }>('/api/v1/lite/disease-areas/:diseaseAreaId/export', async (request, reply) => {
    const user = request.user;
    const { diseaseAreaId } = request.params;

    if (!user?.tenantId) {
      return reply.status(403).send({ error: 'No tenant associated with user' });
    }

    try {
      const data = await liteClientService.exportHcpScores(user.tenantId, diseaseAreaId);

      // Convert to CSV
      if (data.length === 0) {
        return reply.status(404).send({ error: 'No data available for export' });
      }

      const headers = Object.keys(data[0]) as (keyof ExportRow)[];
      const csvRows = [
        headers.join(','),
        ...data.map((row: ExportRow) =>
          headers.map((h) => {
            const val = row[h];
            // Escape values with commas or quotes
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',')
        ),
      ];
      const csv = csvRows.join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="hcp-scores-${diseaseAreaId}.csv"`);
      return csv;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Access denied')) {
        return reply.status(403).send({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Failed to export data';
      return reply.status(500).send({ error: message });
    }
  });

  // ==========================================
  // ADMIN ROUTES (for managing lite client access)
  // ==========================================

  // Get all lite clients with their disease area assignments
  fastify.get('/api/v1/admin/lite-clients', async (request, reply) => {
    const user = request.user;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    try {
      const clients = await liteClientService.getAllLiteClientsWithAccess();
      return clients;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch lite clients';
      return reply.status(500).send({ error: message });
    }
  });

  // Grant disease area access to a lite client
  fastify.post<{
    Params: { clientId: string };
    Body: z.infer<typeof grantAccessSchema>;
  }>('/api/v1/admin/lite-clients/:clientId/access', async (request, reply) => {
    const user = request.user;
    const { clientId } = request.params;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    try {
      const body = grantAccessSchema.parse(request.body);
      const access = await liteClientService.grantAccess(
        clientId,
        body.diseaseAreaId,
        user.sub,
        body.expiresAt ? new Date(body.expiresAt) : undefined
      );
      return reply.status(201).send(access);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
      }
      const message = error instanceof Error ? error.message : 'Failed to grant access';
      return reply.status(500).send({ error: message });
    }
  });

  // Revoke disease area access from a lite client
  fastify.delete<{
    Params: { clientId: string; diseaseAreaId: string };
  }>('/api/v1/admin/lite-clients/:clientId/access/:diseaseAreaId', async (request, reply) => {
    const user = request.user;
    const { clientId, diseaseAreaId } = request.params;

    if (user?.role !== 'PLATFORM_ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    try {
      await liteClientService.revokeAccess(clientId, diseaseAreaId);
      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke access';
      return reply.status(500).send({ error: message });
    }
  });
};
