import { execSync } from 'child_process';
import { ClientFactory } from '../core/tenant/ClientFactory';
import dotenv from 'dotenv';
import { cleanPublicSchema } from './clean-public';

dotenv.config();

async function run() {
  console.log('--- Iniciando Sincronización de Esquema Público (Drizzle Kit) ---');

  try {
    // 1. LIMPIEZA PREVIA: Eliminar tablas de negocio huérfanas en public
    // Esto evita que drizzle-kit intente sincronizarlas o que causen conflictos
    console.log('1. Ejecutando limpieza de tablas de negocio en public...');
    await cleanPublicSchema();

    // 2. Ejecutar drizzle-kit push
    console.log('2. Ejecutando drizzle-kit push --force...');
    try {
      execSync('npx drizzle-kit push --force', {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' },
      });
      console.log('   ✅ Push de esquema core completado.');
    } catch (pushError: any) {
      // Antes había aquí un juego de CREATE TABLE escritos a mano. Se quedó
      // atrás —diez columnas donde el esquema tiene dieciocho— y como iban con
      // IF NOT EXISTS, bastaba con que corriera una vez para que la tabla buena
      // no se creara nunca y el fallo saliera mucho después, al consultarla.
      //
      // Un esquema a medias es peor que ninguno: mejor parar aquí.
      throw new Error(
        `drizzle-kit push falló y no hay alternativa: ${pushError?.message ?? pushError}. ` +
          'Ejecútalo a mano con «npx drizzle-kit push --force» desde apps/server.',
      );
    }

    console.log('--- Sincronización de Esquema Público Finalizada con Éxito ---');
    process.exit(0);
  } catch (error: any) {
    console.error('--- ERROR CRÍTICO EN SINCRONIZACIÓN ---');
    console.error(error.message);
    process.exit(1);
  }
}

run();
