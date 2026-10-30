/**
 * Gestión de tokens de API para integraciones server-to-server.
 * Al crear un token se muestra una sola vez en claro — el usuario debe copiarlo.
 * Los tokens no caducan automáticamente; se revocan manualmente.
 */
import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Loader,
  Checkbox,
  EmptyState,
  PageHeader,
  useToast,
  usePopup,
  CopyButton,
} from '@openfactu/ui';
import { Plus, Trash2, Key, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate, formatDateTime } from '@/i18n/format';

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const ALL_SCOPES = [
  {
    id: 'read:logistics',
    label: 'settings.apiTokens.scopes.readLogistics',
    description: 'GET /api/logistics/*',
  },
  {
    id: 'write:logistics',
    label: 'settings.apiTokens.scopes.writeLogistics',
    description: 'POST/PATCH/DELETE /api/logistics/*',
  },
  {
    id: 'write:ventas',
    label: 'settings.apiTokens.scopes.writeSales',
    description: 'settings.apiTokens.scopes.writeSalesDesc',
  },
  {
    id: 'write:compras',
    label: 'settings.apiTokens.scopes.writePurchases',
    description: 'settings.apiTokens.scopes.writePurchasesDesc',
  },
  {
    id: 'read:maestros',
    label: 'settings.apiTokens.scopes.readMasters',
    description: 'settings.apiTokens.scopes.readMastersDesc',
  },
  {
    id: 'write:maestros',
    label: 'settings.apiTokens.scopes.writeMasters',
    description: 'settings.apiTokens.scopes.writeMastersDesc',
  },
  {
    id: 'mcp:read',
    label: 'settings.apiTokens.scopes.mcpRead',
    description: 'settings.apiTokens.scopes.mcpReadDesc',
  },
  {
    id: 'mcp:sql',
    label: 'settings.apiTokens.scopes.mcpSql',
    description: 'settings.apiTokens.scopes.mcpSqlDesc',
  },
];

export const ApiTokens: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const [rows, setRows] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ name: string; scopes: string[] }>({
    name: '',
    scopes: ['read:logistics'],
  });
  const [created, setCreated] = useState<{ token: string; name: string; scopes: string[] } | null>(
    null,
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const res = await coreApi.raw('GET', '/api/admin/api-tokens');
    const d = res.ok ? res.data : [];
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    if (!form.name.trim()) {
      toast.error(t('settings.apiTokens.nameRequired'));
      return;
    }
    if (form.scopes.length === 0) {
      toast.error(t('settings.apiTokens.scopeRequired'));
      return;
    }
    const res = await coreApi.raw('POST', '/api/admin/api-tokens', {
      name: form.name.trim(),
      scopes: form.scopes,
    });
    const d = res.data;
    if (!res.ok) {
      toast.error(d.error || t('settings.apiTokens.createError'));
      return;
    }
    setCreated({ token: d.token, name: d.name, scopes: form.scopes });
    setShowCreate(false);
    setForm({ name: '', scopes: ['read:logistics'] });
    load();
  };

  const revoke = async (tok: ApiToken) => {
    const ok = await popup.confirm({
      title: t('settings.apiTokens.revokeTitle'),
      message: t('settings.apiTokens.revokeMessage', { name: tok.name }),
      tone: 'danger',
      confirmLabel: t('settings.apiTokens.revoke'),
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/admin/api-tokens/${tok.id}`);
    if (!res.ok) {
      const d = res.data ?? {};
      toast.error(d.error || t('settings.apiTokens.revokeError'));
      return;
    }
    toast.success(t('settings.apiTokens.revoked'));
    load();
  };

  const toggleScope = (id: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(id) ? f.scopes.filter((s) => s !== id) : [...f.scopes, id],
    }));
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('settings.apiTokens.title')}
        subtitle={t('settings.apiTokens.subtitle')}
        icon={<Key size={18} />}
        size="sm"
        divider
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2"
          >
            <Plus size={14} /> {t('settings.apiTokens.newToken')}
          </Button>
        }
      />

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="p-0">
          <EmptyState
            icon={<Key size={18} />}
            title={t('settings.apiTokens.emptyTitle')}
            hint={t('settings.apiTokens.emptyHint')}
            action={
              <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
                <Plus size={14} /> {t('settings.apiTokens.newToken')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((tok) => (
              <li
                key={tok.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 ${
                  tok.revokedAt ? 'opacity-50' : ''
                }`}
              >
                <Badge variant={tok.revokedAt ? 'error' : 'success'}>
                  {tok.revokedAt
                    ? t('settings.apiTokens.revokedBadge')
                    : t('settings.apiTokens.active')}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-fg-default">{tok.name}</span>
                    <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                      {tok.prefix}…
                    </code>
                  </div>
                  <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3 flex-wrap">
                    <span>{t('settings.apiTokens.scopesValue', { scopes: tok.scopes })}</span>
                    <span>
                      {t('settings.apiTokens.createdAt', { date: formatDate(tok.createdAt) })}
                    </span>
                    {tok.lastUsedAt && (
                      <span>
                        {t('settings.apiTokens.lastUsed', { date: formatDateTime(tok.lastUsedAt) })}
                      </span>
                    )}
                  </div>
                </div>
                {!tok.revokedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(tok)}
                    title={t('settings.apiTokens.revoke')}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('settings.apiTokens.newTitle')}
        subtitle={t('settings.apiTokens.newSubtitle')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <Input
            label={t('settings.apiTokens.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('settings.apiTokens.namePlaceholder')}
          />
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              {t('settings.apiTokens.scopesLabel')}
            </label>
            <div className="space-y-2">
              {ALL_SCOPES.map((s) => (
                <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                  <span className="mt-0.5">
                    <Checkbox
                      checked={form.scopes.includes(s.id)}
                      onChange={() => toggleScope(s.id)}
                    />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-fg-default">
                      {t(s.label)}{' '}
                      <code className="px-1 bg-bg-muted text-[10px] font-mono rounded">{s.id}</code>
                    </div>
                    <div className="text-[11px] text-slate-500">{t(s.description)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t('settings.apiTokens.cancel')}
            </Button>
            <Button onClick={create}>{t('settings.apiTokens.create')}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!created}
        onClose={() => setCreated(null)}
        title={t('settings.apiTokens.createdTitle')}
        maxWidth="md"
      >
        {created && (
          <div className="space-y-3 pt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <AlertCircle className="text-amber-600 dark:text-amber-300 flex-shrink-0" size={16} />
              <div className="text-[12px] text-amber-800 dark:text-amber-200">
                {t('settings.apiTokens.saveNowBefore')}
                <b>{t('settings.apiTokens.saveNowStrong')}</b>
                {t('settings.apiTokens.saveNowAfter')}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                {t('settings.apiTokens.tokenLabel', { name: created.name })}
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-bg-muted text-[11px] font-mono rounded break-all">
                  {created.token}
                </code>
                <CopyButton value={created.token} variant="primary" size="md" />
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              {t('settings.apiTokens.useAsHeader')}
              <pre className="mt-1 p-2 bg-bg-muted rounded text-[11px] font-mono">
                Authorization: Bearer {created.token.slice(0, 15)}…
              </pre>
            </div>
            {created.scopes.some((s) => s.startsWith('mcp:')) && (
              <div className="text-[11px] text-slate-500">
                {t('settings.apiTokens.mcpConfig')}
                <pre className="mt-1 p-2 bg-bg-muted rounded text-[11px] font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      mcpServers: {
                        keirost: {
                          url: `${window.location.origin}/api/mcp`,
                          headers: { Authorization: `Bearer ${created.token}` },
                        },
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-border-subtle">
              <Button onClick={() => setCreated(null)}>{t('settings.apiTokens.close')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ApiTokens;
