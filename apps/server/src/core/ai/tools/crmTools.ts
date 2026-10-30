/**
 * Herramientas del CRM para Keiro (chat y MCP).
 *
 * Lectura: oportunidades, actividades y la vista 360 de un cliente. Cada una
 * solo se ofrece con permiso de lectura sobre su parte del CRM, y la vista 360
 * recorta las cifras de documentos que el usuario no puede ver.
 *
 * Acción (con `needsApproval`, solo en el chat): registrar una actividad y
 * mover una oportunidad de etapa. Pasan por la misma lógica que la API (motivo
 * de pérdida obligatorio, historial, eventos), no por SQL suelto.
 */
import { tool } from 'ai';
import { z } from 'zod';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { hasModuleAccess, sandboxQuery, type ChatToolContext } from './util';
import { partnerSummary, partnerTimeline } from '../../crm/partner360';
import { moveOpportunityToStage } from '../../crm/opportunityStage';
import { emitCrmEvent } from '../../crm/events';
import { getConfigSection } from '../../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../../config/appConfig';

const CRM_OFF = { ok: false, error: 'El CRM no está activo en esta empresa.' };

/** Las herramientas se construyen sin acceso a la BD; el flag se mira al ejecutarlas. */
async function crmEnabled(ctx: ChatToolContext): Promise<boolean> {
  const flags = await getConfigSection(ctx.tenantClient, 'flags', FLAGS_DEFAULTS);
  return !!flags.crmEnabled;
}

const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note', 'task'] as const;

export function buildCrmReadTools(ctx: ChatToolContext) {
  const tools: Record<string, any> = {};

  if (hasModuleAccess(ctx, '/crm/opportunities')) {
    tools.list_opportunities = tool({
      description:
        'Lista oportunidades del CRM (embudo comercial) con su etapa, importe, cliente o prospecto, responsable y cierre previsto. Filtra por estado (open = abiertas, won = ganadas, lost = perdidas), cliente o texto.',
      inputSchema: z.object({
        status: z.enum(['open', 'won', 'lost', 'all']).optional().describe('Por defecto open'),
        partnerId: z.string().optional(),
        query: z.string().optional().describe('Texto en título, cliente o prospecto'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input: {
        status?: 'open' | 'won' | 'lost' | 'all';
        partnerId?: string;
        query?: string;
        limit?: number;
      }) => {
        if (!(await crmEnabled(ctx))) return CRM_OFF;
        const status = input.status ?? 'open';
        return sandboxQuery(
          ctx,
          `SELECT o.id, o.title, o.amount, o."expectedCloseDate", o."closedAt", o."lostReason",
                  o.source, o."ownerUserId", s.name AS "stageName", s.kind AS "stageKind",
                  s.probability, COALESCE(p.name, o."prospectCompany", o."prospectName") AS "clientName",
                  o."partnerId" IS NULL AS "isProspect"
             FROM "Opportunity" o
             JOIN "OpportunityStage" s ON s.id = o."stageId"
             LEFT JOIN "BusinessPartner" p ON p.id = o."partnerId"
            WHERE (:status = 'all' OR s.kind = :status)
              AND (:partnerId = '' OR o."partnerId" = :partnerId)
              AND (:q = '' OR o.title ILIKE :qLike OR p.name ILIKE :qLike
                   OR o."prospectCompany" ILIKE :qLike OR o."prospectName" ILIKE :qLike)
            ORDER BY o."expectedCloseDate" NULLS LAST, o."createdAt" DESC
            LIMIT :limit`,
          {
            status,
            partnerId: input.partnerId ?? '',
            q: input.query ?? '',
            qLike: `%${input.query ?? ''}%`,
            limit: input.limit ?? 30,
          },
        );
      },
    });
  }

  if (hasModuleAccess(ctx, '/crm/activities')) {
    tools.list_crm_activities = tool({
      description:
        'Lista actividades comerciales (llamadas, reuniones, correos, notas, tareas). Por defecto las pendientes del usuario actual, las vencidas primero.',
      inputSchema: z.object({
        status: z.enum(['pending', 'done', 'all']).optional(),
        mine: z.boolean().optional().describe('Solo las del usuario actual (por defecto true)'),
        partnerId: z.string().optional(),
        opportunityId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input: {
        status?: 'pending' | 'done' | 'all';
        mine?: boolean;
        partnerId?: string;
        opportunityId?: string;
        limit?: number;
      }) => {
        if (!(await crmEnabled(ctx))) return CRM_OFF;
        return sandboxQuery(
          ctx,
          `SELECT a.id, a.type, a.subject, a.body, a."dueAt", a."doneAt",
                  COALESCE(p.name, o."prospectCompany", o."prospectName") AS "clientName",
                  o.title AS "opportunityTitle", c.name AS "contactName"
             FROM "CrmActivity" a
             LEFT JOIN "BusinessPartner" p ON p.id = a."partnerId"
             LEFT JOIN "Opportunity" o ON o.id = a."opportunityId"
             LEFT JOIN "Contact" c ON c.id = a."contactId"
            WHERE (:status = 'all' OR (:status = 'pending' AND a."doneAt" IS NULL)
                   OR (:status = 'done' AND a."doneAt" IS NOT NULL))
              AND (:owner = '' OR a."ownerUserId" = :owner)
              AND (:partnerId = '' OR a."partnerId" = :partnerId)
              AND (:opportunityId = '' OR a."opportunityId" = :opportunityId)
            ORDER BY a."doneAt" IS NOT NULL, a."dueAt" NULLS LAST, a."createdAt" DESC
            LIMIT :limit`,
          {
            status: input.status ?? 'pending',
            owner: input.mine === false ? '' : ctx.user.id,
            partnerId: input.partnerId ?? '',
            opportunityId: input.opportunityId ?? '',
            limit: input.limit ?? 30,
          },
        );
      },
    });

    tools.crm_partner_summary = tool({
      description:
        'Resumen comercial de un cliente: facturado en 12 meses, pendiente de cobro, última compra, presupuestos y oportunidades abiertas, y su historial reciente (actividades, oportunidades y documentos). Úsalo para «¿qué tengo con ACME?» o para preparar una llamada.',
      inputSchema: z.object({
        partnerId: z.string().describe('Id del interlocutor (búscalo antes con search_partners)'),
      }),
      execute: async ({ partnerId }: { partnerId: string }) => {
        if (!(await crmEnabled(ctx))) return CRM_OFF;
        const canRead = (path: string) => hasModuleAccess(ctx, path);
        const [summary, timeline] = await Promise.all([
          partnerSummary(ctx.tenantClient, partnerId, canRead),
          partnerTimeline(ctx.tenantClient, partnerId, canRead, { limit: 15 }),
        ]);
        return { summary, timeline };
      },
    });
  }

  return tools;
}

export function buildCrmActionTools(ctx: ChatToolContext) {
  const tools: Record<string, any> = {};

  if (hasModuleAccess(ctx, '/crm/activities', 'write')) {
    tools.create_crm_activity = tool({
      description:
        'Registra una actividad comercial (llamada, reunión, correo, nota o tarea) ligada a un cliente, contacto u oportunidad. Requiere aprobación del usuario.',
      inputSchema: z.object({
        type: z.enum(ACTIVITY_TYPES),
        subject: z.string().min(1),
        body: z.string().optional(),
        partnerId: z.string().optional(),
        contactId: z.string().optional(),
        opportunityId: z.string().optional(),
        dueDate: z.string().optional().describe('yyyy-mm-dd; vacío = sin fecha'),
        done: z.boolean().optional().describe('true si ya está hecha (p.ej. una llamada ya hecha)'),
      }),
      needsApproval: true,
      execute: async (input: {
        type: (typeof ACTIVITY_TYPES)[number];
        subject: string;
        body?: string;
        partnerId?: string;
        contactId?: string;
        opportunityId?: string;
        dueDate?: string;
        done?: boolean;
      }) => {
        if (!(await crmEnabled(ctx))) return CRM_OFF;
        if (!input.partnerId && !input.contactId && !input.opportunityId)
          return { ok: false, error: 'Indica el cliente, el contacto o la oportunidad' };
        let partnerId = input.partnerId ?? null;
        if (!partnerId && input.opportunityId) {
          const [o] = await ctx.tenantClient
            .select({ partnerId: schema.opportunities.partnerId })
            .from(schema.opportunities)
            .where(eq(schema.opportunities.id, input.opportunityId));
          partnerId = o?.partnerId ?? null;
        }
        const [row] = await ctx.tenantClient
          .insert(schema.crmActivities)
          .values({
            id: crypto.randomUUID(),
            type: input.type,
            subject: input.subject.slice(0, 300),
            body: input.body ?? null,
            partnerId,
            contactId: input.contactId ?? null,
            opportunityId: input.opportunityId ?? null,
            dueAt: input.dueDate ? new Date(input.dueDate) : null,
            doneAt: input.done ? new Date() : null,
            ownerUserId: ctx.user.id,
          })
          .returning();
        await emitCrmEvent(
          'crm.activity.created',
          { tenantId: ctx.tenantId, db: ctx.tenantClient, user: ctx.user },
          row,
        );
        return { ok: true, id: row.id, subject: row.subject };
      },
    });
  }

  if (hasModuleAccess(ctx, '/crm/opportunities', 'write')) {
    tools.move_opportunity = tool({
      description:
        'Cambia la etapa de una oportunidad (por nombre de etapa, p.ej. «Propuesta», «Ganada», «Perdida»). Para pasarla a perdida hay que dar el motivo. Requiere aprobación del usuario.',
      inputSchema: z.object({
        opportunityId: z.string(),
        stageName: z.string(),
        lostReason: z.string().optional(),
      }),
      needsApproval: true,
      execute: async (input: { opportunityId: string; stageName: string; lostReason?: string }) => {
        if (!(await crmEnabled(ctx))) return CRM_OFF;
        const db = ctx.tenantClient;
        const [opp] = await db
          .select()
          .from(schema.opportunities)
          .where(eq(schema.opportunities.id, input.opportunityId));
        if (!opp) return { ok: false, error: 'Oportunidad no encontrada' };
        const stages = await db.select().from(schema.opportunityStages);
        const stage = stages.find(
          (s: any) => s.name.toLowerCase() === input.stageName.trim().toLowerCase(),
        );
        if (!stage)
          return {
            ok: false,
            error: `No hay ninguna etapa «${input.stageName}». Etapas: ${stages.map((s: any) => s.name).join(', ')}`,
          };
        if (stage.id === opp.stageId) return { ok: true, note: 'Ya estaba en esa etapa' };
        if (stage.kind === 'lost' && !(input.lostReason ?? opp.lostReason))
          return { ok: false, error: 'Para darla por perdida hace falta el motivo' };
        const row = await moveOpportunityToStage(
          db,
          { tenantId: ctx.tenantId, user: ctx.user },
          opp,
          stage,
          input.lostReason ? { lostReason: input.lostReason } : {},
        );
        return { ok: true, id: row.id, stage: stage.name };
      },
    });
  }

  return tools;
}
