import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChatMessageMetadata } from './types';

/**
 * Pie de un mensaje del asistente: tokens usados en el turno (pedido por el
 * usuario para "ver el contexto usado"), velocidad de respuesta, y un aviso
 * explícito si se cortó por límite de tokens.
 *
 * Muchos proveedores locales (Ollama vía su capa OpenAI-compatible) no
 * reportan `usage` — cuando el server no lo manda, se usa una estimación
 * cliente (∼4 caracteres/token, heurística estándar) sobre el texto +
 * razonamiento del propio mensaje, marcada con "~" para dejar claro que es
 * aproximada. El tiempo transcurrido siempre es real (medido en el cliente),
 * nunca depende del proveedor.
 */
export const MessageFooter: React.FC<{
  metadata?: unknown;
  estimate: { tokens: number; elapsedMs: number } | null;
}> = ({ metadata, estimate }) => {
  const meta = metadata as ChatMessageMetadata | undefined;
  const cut = meta?.finishReason === 'length';
  const serverTokens = meta?.usage?.totalTokens;
  const tokens = serverTokens ?? estimate?.tokens;
  const elapsedMs = estimate?.elapsedMs;
  if (!cut && !tokens && !elapsedMs) return null;

  const seconds = elapsedMs ? elapsedMs / 1000 : null;
  const tokensPerSec = tokens && seconds && seconds > 0.1 ? tokens / seconds : null;

  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
      {tokens !== undefined && (
        <span
          title={
            serverTokens !== undefined
              ? 'Tokens reales del proveedor'
              : 'Estimado (~4 caracteres/token) — el proveedor no reporta uso real'
          }
        >
          {serverTokens === undefined && '~'}
          {tokens.toLocaleString('es-ES')} tokens
        </span>
      )}
      {seconds !== null && <span>· {seconds.toFixed(1)}s</span>}
      {tokensPerSec !== null && <span>· {tokensPerSec.toFixed(0)} tok/s</span>}
      {cut && (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
          <AlertTriangle size={10} />
          {meta?.provider === 'local' && meta?.localBackend === 'ollama' ? (
            <>
              Respuesta cortada — el contexto de Ollama por defecto es corto (~4k tokens). Para
              ampliarlo de verdad: crea un Modelfile con{' '}
              <code className="font-mono">PARAMETER num_ctx 8192</code> y{' '}
              <code className="font-mono">ollama create</code> tu modelo con ese ajuste.
            </>
          ) : (
            'Respuesta cortada por límite de tokens — pídele que continúe.'
          )}
        </span>
      )}
    </div>
  );
};
