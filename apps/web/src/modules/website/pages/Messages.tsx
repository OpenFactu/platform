import React, { useEffect, useState } from 'react';
import { Badge, Card, Loader, useToast } from '@openfactu/ui';
import { Inbox, MailOpen } from 'lucide-react';
import { websiteApi } from '../api/websiteApi';
import type { WebsiteSubmission } from '../domain/website';

/** Bandeja de mensajes recibidos por el formulario de contacto de la web. */
export const Messages: React.FC = () => {
  const toast = useToast();
  const [rows, setRows] = useState<WebsiteSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      setRows(await websiteApi.listSubmissions());
    } catch {
      toast.error('Error al cargar los mensajes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async (row: WebsiteSubmission) => {
    if (row.read) return;
    try {
      await websiteApi.markSubmissionRead(row.id);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
    } catch {
      toast.error('Error al marcar leído');
    }
  };

  if (loading) return <Loader />;

  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="space-y-1 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-1.5 bg-teal-600 rounded-lg text-white">
            <Inbox size={20} />
          </span>
          <span className="text-[10px] font-black text-teal-600 dark:text-teal-300 uppercase tracking-[0.2em]">
            Website / Mensajes
          </span>
        </div>
        <h1 className="text-4xl font-black text-fg-default tracking-tight text-display">
          Mensajes de contacto
        </h1>
        <p className="text-fg-muted font-medium">
          {unread > 0 ? `${unread} sin leer` : 'Todo leído'} — enviados desde el formulario de tu
          web pública.
        </p>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <MailOpen size={32} className="mx-auto mb-3 opacity-40" />
            Aún no has recibido ningún mensaje.
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <li
                key={row.id}
                onClick={() => markRead(row)}
                className={`px-6 py-4 cursor-pointer transition-colors hover:bg-bg-hover ${row.read ? 'opacity-70' : ''}`}
              >
                <div className="flex items-center justify-between gap-4 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {!row.read && <Badge variant="info">Nuevo</Badge>}
                    <span className="font-bold text-fg-default text-sm truncate">
                      {row.name || 'Sin nombre'}
                    </span>
                    {row.email && (
                      <a
                        href={`mailto:${row.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-teal-600 dark:text-teal-300 font-mono hover:underline truncate"
                      >
                        {row.email}
                      </a>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-fg-body whitespace-pre-wrap">{row.message}</p>
                {row.meta?.fields && Object.keys(row.meta.fields).length > 0 && (
                  <dl className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2 text-xs bg-bg-muted rounded-lg p-3">
                    {Object.entries(row.meta.fields).map(([key, value]) => (
                      <div key={key} className="flex gap-2 min-w-0">
                        <dt className="font-bold text-fg-muted whitespace-nowrap">
                          {key.replace(/_/g, ' ')}:
                        </dt>
                        <dd className="text-fg-body truncate">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
