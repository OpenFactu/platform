/**
 * Bancos: `core/banking` tiene las reglas, aquí solo se traduce HTTP y se deja la auditoría.
 */
import { Router } from 'express';
import { logAudit } from '../utils/audit';
import { BankFormats } from '../core/banking/bankFormats';
import {
  entryFromLine,
  ignoreLine,
  matchLine,
  payFromLine,
  statementLineDetail,
  suggestForLine,
  undoLine,
} from '../core/banking/reconciliation';
import {
  bankAccountFormOptions,
  bankAccountOptions,
  createBankAccount,
  deleteBankAccount,
  importStatement,
  ledgerAccounts,
  listBankAccounts,
  listStatementLines,
  previewStatement,
  updateBankAccount,
} from '../core/banking/statements';
import {
  batchCandidates,
  batchDetail,
  batchFile,
  closeBatch,
  createBatch,
  deleteBatch,
  generateBatch,
  listBatches,
  returnBatchLine,
} from '../core/banking/paymentBatches';
import { requireScope } from './middleware/apiToken';
import { invalidateDashboardCache } from './dashboard';

const handle =
  (run: (req: any, res: any) => Promise<unknown>) =>
  async (req: any, res: any): Promise<void> => {
    try {
      const result = await run(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };

/** Han cambiado cobros o deudas: el panel de inicio no puede seguir con lo de antes. */
const moneyChanged = (req: any) => {
  if (req.tenantId) invalidateDashboardCache(req.tenantId);
};

const audit = (
  req: any,
  entityType: string,
  entityId: string,
  action: Parameters<typeof logAudit>[0]['action'],
  newValue?: unknown,
) =>
  logAudit({
    tenantClient: req.tenantClient,
    tenantId: req.tenantId || '',
    userId: req.user?.id,
    entityType,
    entityId,
    action,
    newValue,
  });

// ── Cuentas de la empresa ──
export const bankAccountsRouter = Router();
bankAccountsRouter.use(requireScope('write:bancos'));

bankAccountsRouter.get(
  '/',
  handle((req) => listBankAccounts(req.tenantClient)),
);

bankAccountsRouter.get(
  '/form-options',
  handle((req) => bankAccountFormOptions(req.tenantClient)),
);

bankAccountsRouter.post(
  '/',
  handle(async (req) => {
    const created = await createBankAccount(req.tenantClient, req.body ?? {});
    await audit(req, 'CompanyBankAccount', created.id, 'CREATE', { name: req.body?.name });
    return created;
  }),
);

bankAccountsRouter.patch(
  '/:id',
  handle(async (req) => {
    const updated = await updateBankAccount(req.tenantClient, req.params.id, req.body ?? {});
    await audit(req, 'CompanyBankAccount', req.params.id, 'UPDATE', req.body);
    return updated;
  }),
);

bankAccountsRouter.delete(
  '/:id',
  handle(async (req) => {
    const removed = await deleteBankAccount(req.tenantClient, req.params.id);
    await audit(req, 'CompanyBankAccount', req.params.id, 'DELETE');
    return removed;
  }),
);

/** Para elegir la cuenta al cobrar, con los permisos de quien cobra. */
export const bankAccountOptionsRouter = Router();
bankAccountOptionsRouter.get(
  '/',
  handle((req) => bankAccountOptions(req.tenantClient)),
);

// ── Extractos y conciliación ──
export const bankStatementsRouter = Router();
bankStatementsRouter.use(requireScope('write:bancos'));

bankStatementsRouter.get(
  '/formats',
  handle(async (req) => BankFormats.statementFormatsFor(req.tenantId)),
);

bankStatementsRouter.get(
  '/ledger-accounts',
  handle((req) => ledgerAccounts(req.tenantClient)),
);

// Enviar el fichero no guarda nada: es POST solo porque va en el cuerpo.
bankStatementsRouter.post(
  '/preview',
  handle(async (req) => previewStatement(req.tenantId, req.body ?? {})),
);

bankStatementsRouter.post(
  '/import',
  handle(async (req) => {
    const result = await importStatement(
      { db: req.tenantClient, tenantId: req.tenantId, user: req.user },
      req.body ?? {},
    );
    await audit(req, 'BankStatementImport', result.importId, 'CREATE', {
      fileName: req.body?.fileName,
      added: result.added,
      skipped: result.skipped,
    });
    return result;
  }),
);

bankStatementsRouter.get(
  '/lines',
  handle((req) => listStatementLines(req.tenantClient, req.query)),
);

bankStatementsRouter.get(
  '/lines/:id',
  handle((req) => statementLineDetail(req.tenantClient, req.params.id)),
);

bankStatementsRouter.get(
  '/lines/:id/suggestions',
  handle((req) => suggestForLine(req.tenantClient, req.params.id, req.query.q)),
);

const lineAction = (
  action: string,
  run: (ctx: { db: any; user?: any }, req: any) => Promise<unknown>,
) =>
  handle(async (req) => {
    const result = await run({ db: req.tenantClient, user: req.user }, req);
    await audit(req, 'BankStatementLine', req.params.id, 'UPDATE', { action, ...req.body });
    moneyChanged(req);
    return result;
  });

bankStatementsRouter.post(
  '/lines/:id/match',
  lineAction('match', (ctx, req) => matchLine(ctx, req.params.id, req.body ?? {})),
);
bankStatementsRouter.post(
  '/lines/:id/pay',
  lineAction('pay', (ctx, req) => payFromLine(ctx, req.params.id, req.body ?? {})),
);
bankStatementsRouter.post(
  '/lines/:id/entry',
  lineAction('entry', (ctx, req) => entryFromLine(ctx, req.params.id, req.body ?? {})),
);
bankStatementsRouter.post(
  '/lines/:id/undo',
  lineAction('undo', (ctx, req) => undoLine(ctx, req.params.id)),
);
bankStatementsRouter.post(
  '/lines/:id/ignore',
  lineAction('ignore', (ctx, req) => ignoreLine(ctx, req.params.id, req.body?.ignored !== false)),
);

// ── Remesas ──
export const paymentBatchesRouter = Router();
paymentBatchesRouter.use(requireScope('write:bancos'));

paymentBatchesRouter.get(
  '/',
  handle((req) => listBatches(req.tenantClient)),
);

paymentBatchesRouter.get(
  '/candidates',
  handle((req) => batchCandidates(req.tenantClient, req.query)),
);

paymentBatchesRouter.get(
  '/exporters',
  handle(async (req) =>
    BankFormats.exportersFor(req.tenantId, req.query.kind).map(({ id, label }) => ({ id, label })),
  ),
);

paymentBatchesRouter.post(
  '/',
  handle(async (req) => {
    const created = await createBatch({ db: req.tenantClient, user: req.user }, req.body ?? {});
    await audit(req, 'PaymentBatch', created.id, 'CREATE', {
      code: created.code,
      kind: req.body?.kind,
    });
    return created;
  }),
);

paymentBatchesRouter.get(
  '/:id',
  handle((req) => batchDetail(req.tenantClient, req.params.id)),
);

paymentBatchesRouter.delete(
  '/:id',
  handle(async (req) => {
    const removed = await deleteBatch({ db: req.tenantClient }, req.params.id);
    await audit(req, 'PaymentBatch', req.params.id, 'DELETE', { code: removed.code });
    return { success: true };
  }),
);

paymentBatchesRouter.post(
  '/:id/generate',
  handle(async (req) => {
    const result = await generateBatch(
      { db: req.tenantClient, tenantId: req.tenantId },
      req.params.id,
      req.body ?? {},
    );
    await audit(req, 'PaymentBatch', req.params.id, 'UPDATE', {
      action: 'generate',
      exporterId: req.body?.exporterId,
    });
    return result;
  }),
);

paymentBatchesRouter.get(
  '/:id/file',
  handle(async (req, res) => {
    const file = await batchFile(req.tenantClient, req.params.id);
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.fileContent);
  }),
);

paymentBatchesRouter.post(
  '/:id/close',
  handle(async (req) => {
    const result = await closeBatch({ db: req.tenantClient, user: req.user }, req.params.id);
    await audit(req, 'PaymentBatch', req.params.id, 'UPDATE', { action: 'close' });
    moneyChanged(req);
    return result;
  }),
);

paymentBatchesRouter.post(
  '/:id/lines/:lineId/return',
  handle(async (req) => {
    const result = await returnBatchLine(
      { db: req.tenantClient, user: req.user },
      req.params.id,
      req.params.lineId,
      req.body ?? {},
    );
    await audit(req, 'PaymentBatch', req.params.id, 'UPDATE', {
      action: 'return',
      lineId: req.params.lineId,
      reason: req.body?.reason,
    });
    moneyChanged(req);
    return result;
  }),
);
