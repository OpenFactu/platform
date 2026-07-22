import * as esbuild from 'esbuild';

const DEFAULT_API_BASE = 'http://localhost:3000';

/**
 * Mapeo de paquetes externos a sus URLs en el servidor SDK, relativo al host
 * que el navegador usó para llegar al server (nunca hardcodeado) — así
 * funciona igual en localhost, por IP de LAN, o detrás de un dominio.
 */
const buildExternalPackageMap = (apiBase: string): Record<string, string> => ({
  react: `${apiBase}/api/plugins/sdk/react.js`,
  'react-dom': `${apiBase}/api/plugins/sdk/react-dom.js`,
  'lucide-react': `${apiBase}/api/plugins/sdk/lucide-react.js`,
  '@openfactu/ui': `${apiBase}/api/plugins/sdk/@openfactu/ui.js`,
  'react-router-dom': `${apiBase}/api/plugins/sdk/react-router-dom.js`,
  '@openfactu/widget-api': `${apiBase}/api/plugins/sdk/@openfactu/widget-api.js`,
});

/**
 * Plugin de esbuild que reescribe los bare imports a URLs absolutas del servidor.
 * Esto permite que el navegador resuelva las dependencias externas correctamente.
 */
const buildSdkResolverPlugin = (apiBase: string): esbuild.Plugin => {
  const externalPackageMap = buildExternalPackageMap(apiBase);
  return {
    name: 'sdk-resolver',
    setup(build) {
      // Interceptar la resolución de los paquetes externos
      build.onResolve(
        {
          filter:
            /^(react|react-dom|lucide-react|@openfactu\/ui|react-router-dom|@openfactu\/widget-api)/,
        },
        (args) => {
          const url = externalPackageMap[args.path];
          if (url) {
            return {
              path: url,
              external: true, // Decirle a esbuild que no lo empaquete
            };
          }
          return null;
        },
      );
    },
  };
};

/**
 * Transpila un archivo (.tsx, .ts) a un módulo ESM compatible con el navegador.
 * Las dependencias externas se reescriben como URLs absolutas del servidor SDK,
 * usando `apiBase` (derivado del request que llegó al server) para que el
 * bundle resultante apunte al mismo host que usó el navegador para pedirlo.
 */
export const transpilePluginFile = async (
  filePath: string,
  apiBase: string = DEFAULT_API_BASE,
): Promise<string> => {
  try {
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      minify: process.env.NODE_ENV === 'production',
      plugins: [buildSdkResolverPlugin(apiBase)],
      write: false,
      loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.js': 'js',
        '.jsx': 'jsx',
        '.css': 'css',
        '.json': 'json',
      },
    });

    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new Error('Esbuild no produjo salida');
    }

    return result.outputFiles[0].text;
  } catch (error) {
    console.error(`[Transpiler] Error al transpilar ${filePath}:`, error);
    throw error;
  }
};

/**
 * Transpila código TSX en memoria (sin tocar disco) a un módulo ESM
 * compatible con el navegador. Usado para componentes de widget escritos
 * directamente desde la web y guardados como texto en BD (ver
 * `apps/server/src/api/dashboardWidgets.ts`).
 */
export const transpileSource = async (
  code: string,
  apiBase: string = DEFAULT_API_BASE,
): Promise<string> => {
  const result = await esbuild.build({
    stdin: {
      contents: code,
      loader: 'tsx',
      resolveDir: process.cwd(),
      sourcefile: 'widget.tsx',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    plugins: [buildSdkResolverPlugin(apiBase)],
    write: false,
  });

  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error('Esbuild no produjo salida');
  }

  return result.outputFiles[0].text;
};
