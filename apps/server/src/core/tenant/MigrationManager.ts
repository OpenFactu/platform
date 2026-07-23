import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ClientFactory } from './ClientFactory';
import { sql, eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { getDefaultTemplate, getDefaultTemplateName, DEFAULT_TEMPLATE_NAMES } from '@openfactu/pdf';
import { DocumentRegistry, type DocumentTypeConfig } from '../documents/DocumentRegistry';
import { seedDefaults } from './seedDefaults';

/**
 * HTML de plantilla de fábrica para un tipo. Los 6 core van SIN overrides
 * (byte-idéntico al histórico — el resync compara/reescribe estas filas en
 * cada boot); los tipos nuevos reciben su título/etiqueta desde la config.
 */
function factoryTemplateHtml(config: DocumentTypeConfig): string {
  if (DEFAULT_TEMPLATE_NAMES[config.docType]) return getDefaultTemplate(config.docType);
  return getDefaultTemplate(config.docType, {
    title: config.label,
    partnerLabel: config.partnerLabel ?? (config.side === 'sales' ? 'Cliente' : 'Proveedor'),
  });
}

/**
 * MigrationManager lee archivos .sql de la carpeta /migrations
 * y los aplica a cada esquema de empresa usando Drizzle.
 */
export class MigrationManager {
  private static MIGRATIONS_DIR = path.join(__dirname, 'migrations');

  /**
   * Sincroniza una empresa específica.
   */
  public static async syncTenant(schemaName: string) {
    const db = ClientFactory.getClient(schemaName);
    console.log(`[MigrationManager] Verificando esquema: ${schemaName}`);

    // 1. Asegurar tabla de historia (SQL Directo)
    await db.execute(
      sql.raw(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."_MigrationHistory" (
        "id" TEXT PRIMARY KEY,
        "description" TEXT,
        "appliedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `),
    );

    // 2. Leer archivos SQL
    if (!fs.existsSync(this.MIGRATIONS_DIR)) {
      // Esto suele pasar en producción: el `tsc build` no copia los .sql a
      // `dist/core/tenant/migrations`. Si pasa, ninguna migración se aplica
      // y el tenant queda sin tablas (SystemConfig, AccountingPeriod, ...).
      // Asegúrate de que `package.json` tenga un step `copy-assets` que
      // copie los .sql a `dist/`, o ejecuta `npm run sync` desde `src/`.
      console.error(
        `[MigrationManager] ⚠️  Carpeta de migraciones AUSENTE: ${this.MIGRATIONS_DIR}\n` +
          `   Las migraciones NO se aplicarán. El tenant ${schemaName} quedará sin tablas.\n` +
          `   Solución: en producción asegúrate de que los archivos .sql se copian a\n` +
          `   dist/core/tenant/migrations/. En dev usa \`npm run dev\` (corre desde src).`,
      );
      return;
    }

    const files = fs
      .readdirSync(this.MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationId = file.replace('.sql', '');

      // Verificar si ya se aplicó
      const result: any = await db.execute(
        sql.raw(`SELECT id FROM "${schemaName}"."_MigrationHistory" WHERE id = '${migrationId}'`),
      );

      if (result.rows.length === 0) {
        console.log(`[MigrationManager] Aplicando migración: ${file}`);

        try {
          const filePath = path.join(this.MIGRATIONS_DIR, file);
          let rawSql = fs.readFileSync(filePath, 'utf8');
          const processedSql = rawSql.replace(/{{schema}}/g, schemaName);

          // Eliminamos los comentarios de línea (-- ... \n) ANTES de dividir,
          // porque si un comentario contiene `;` el splitter partía ahí y el
          // texto del comentario se ejecutaba como SQL. No tocamos strings
          // entrecomillados ni bloques $$ PL/pgSQL.
          const stripped = processedSql.replace(/--[^\n]*/g, '');

          // Dividir por punto y coma, ignorando aquellos dentro de bloques $$ (PL/pgSQL)
          const statements = stripped
            .split(/;(?=(?:[^$]*\$\$[^$]*\$\$)*[^$]*$)/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          for (const statement of statements) {
            try {
              await db.execute(sql.raw(statement));
            } catch (stmtError: any) {
              // Tenants importados de un backup pueden traer objetos que la
              // migración intenta crear (la tabla existe en el dump pero su
              // _MigrationHistory no registró esta migración). Un "ya existe"
              // no es un fallo real: saltamos el statement y seguimos, para
              // que el catch-up post-import no aborte la sincronización.
              const pgCode = stmtError?.cause?.code || stmtError?.code;
              const alreadyExists =
                ['42P07', '42701', '42710', '42P06', '42723'].includes(pgCode) ||
                /already exists|ya existe/i.test(
                  stmtError?.cause?.message || stmtError?.message || '',
                );
              if (alreadyExists) {
                console.warn(
                  `   ⚠️  Objeto ya existente en ${file} (${pgCode || 'sin código'}) — statement omitido`,
                );
                continue;
              }
              throw stmtError;
            }
          }

          // Registrar éxito
          await db.execute(
            sql.raw(
              `INSERT INTO "${schemaName}"."_MigrationHistory" (id, description) VALUES ('${migrationId}', 'Aplicado desde ${file}')`,
            ),
          );

          console.log(`   ✅ Sincronizado correctamente.`);
        } catch (error: any) {
          console.error(`   ❌ Error en ${file}:`, error); // Log full error object
          throw error;
        }
      }
    }

    // 3. Seed de datos maestros por defecto (impuestos, UoMs, series, etc.)
    try {
      await seedDefaults(schemaName);
    } catch (err: any) {
      console.warn(
        `[MigrationManager] No se pudieron sembrar defaults en ${schemaName}: ${err.message}`,
      );
    }

    // 4. Seed de plantillas de documento por defecto (si no existen)
    await this.seedDefaultTemplates(schemaName);

    // 5. Resync de plantillas default al último HTML del paquete @openfactu/pdf.
    //    Solo toca las marcadas `isDefault=true` — plantillas custom no se
    //    modifican. Así al publicar versión nueva del paquete (nuevo bloque
    //    de firma, nuevos campos fiscales...) el tenant se actualiza al
    //    reiniciar sin comandos manuales.
    try {
      await this.resyncDefaultTemplates(schemaName);
    } catch (err: any) {
      console.warn(
        `[MigrationManager] No se pudieron resincronizar plantillas en ${schemaName}: ${err.message}`,
      );
    }
  }

  /**
   * Regenera la plantilla "de fábrica" (`isFactoryDefault=true`) de cada
   * docType, SIN tocar las plantillas custom. Útil tras un cambio de paleta
   * o de layout del generador visual (p.ej. al publicar una versión nueva
   * de @openfactu/pdf).
   *
   * A propósito filtra por `isFactoryDefault`, NO por `isDefault`: si un
   * usuario promueve su plantilla personalizada a predeterminada
   * (`isDefault=true`), sigue siendo SU plantilla — nunca la fila sembrada
   * por el sistema — y no debe regenerarse aquí (bug histórico: antes se
   * filtraba por `isDefault`, así que promover una plantilla custom a
   * predeterminada la exponía a que el siguiente reinicio le sobreescribiera
   * html y name con el genérico de fábrica).
   */
  public static async resyncDefaultTemplates(schemaName: string): Promise<number> {
    const db = ClientFactory.getClient(schemaName);
    let updated = 0;
    console.log(`[Templates] Resync plantillas por defecto en ${schemaName}…`);
    // Iteramos los tipos del DocumentRegistry (poblado por
    // registerDocumentTypes antes de syncAllTenants), no el ALL_DOC_TYPES de
    // @openfactu/pdf — así los tipos nuevos (SQ, plugins) también reciben su
    // plantilla. Para los 6 core el nombre/HTML emitido es byte-idéntico.
    for (const config of DocumentRegistry.getAll()) {
      const docType = config.docType;
      const [existing] = await db
        .select()
        .from(schema.documentTemplates)
        .where(
          and(
            eq(schema.documentTemplates.docType, docType),
            eq(schema.documentTemplates.isFactoryDefault, true),
          ),
        );
      const html = factoryTemplateHtml(config);
      const hasSignature = html.includes('signature-block');
      if (!hasSignature) {
        console.warn(
          `[Templates] ⚠ Plantilla ${docType} sin bloque signature-block — revisa @openfactu/pdf dist`,
        );
      }
      if (existing) {
        await db
          .update(schema.documentTemplates)
          .set({ html, name: getDefaultTemplateName(docType, config.label) })
          .where(eq(schema.documentTemplates.id, existing.id));
      } else {
        // No hay fila de fábrica para este docType (tenant nuevo, o backfill
        // de la migración 060 que no la marcó porque la única fila
        // isDefault=true era custom). No tocamos cuál es la predeterminada
        // actual del usuario: solo la marcamos isDefault si de verdad no hay
        // ninguna otra ya activa para este docType.
        const [currentDefault] = await db
          .select({ id: schema.documentTemplates.id })
          .from(schema.documentTemplates)
          .where(
            and(
              eq(schema.documentTemplates.docType, docType),
              eq(schema.documentTemplates.isDefault, true),
            ),
          );
        await db.insert(schema.documentTemplates).values({
          id: crypto.randomUUID(),
          docType,
          name: getDefaultTemplateName(docType, config.label),
          html,
          isDefault: !currentDefault,
          isFactoryDefault: true,
        });
      }
      updated++;
    }
    return updated;
  }

  /**
   * Inserta una plantilla por defecto para cada tipo de documento que aún no tenga ninguna.
   */
  private static async seedDefaultTemplates(schemaName: string) {
    const db = ClientFactory.getClient(schemaName);
    try {
      for (const config of DocumentRegistry.getAll()) {
        const docType = config.docType;
        const existing = await db
          .select({ id: schema.documentTemplates.id })
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.docType, docType));
        if (existing.length > 0) continue;

        await db.insert(schema.documentTemplates).values({
          id: crypto.randomUUID(),
          docType,
          name: getDefaultTemplateName(docType, config.label),
          html: factoryTemplateHtml(config),
          isDefault: true,
          isFactoryDefault: true,
        });
        console.log(`[Templates] Seeded default template for ${docType} in ${schemaName}`);
      }
    } catch (err: any) {
      console.warn(`[Templates] No se pudo sembrar plantillas en ${schemaName}: ${err.message}`);
    }
  }

  /**
   * Sincroniza todos los tenants.
   */
  public static async syncAllTenants() {
    console.log('[MigrationManager] Iniciando sincronización global...');
    const db = ClientFactory.getClient('public');

    try {
      // Usamos Drizzle tipado para obtener la lista de tenants
      const tenantsList = await db
        .select({
          schemaName: schema.tenants.schemaName,
        })
        .from(schema.tenants);

      for (const t of tenantsList) {
        try {
          await this.syncTenant(t.schemaName);
        } catch (err: any) {
          // Un tenant con problemas (p.ej. importado con estado inconsistente)
          // no debe bloquear la sincronización del resto de empresas.
          console.error(
            `[MigrationManager] ❌ Sincronización fallida en ${t.schemaName}: ${err?.message}`,
          );
        }
      }
      console.log('[MigrationManager] Sincronización finalizada.');
    } catch (error: any) {
      // Si la tabla no existe aún, informamos discretamente
      if (error.message.includes('relation "Tenant" does not exist')) {
        console.warn(
          '[MigrationManager] Tabla Tenant no encontrada. Postergando sincronización global.',
        );
      } else {
        console.error('[MigrationManager] Error en sincronización global:', error.message);
      }
    }
  }
}
