/**
 * Interfaz común a todos los proveedores de almacenamiento de adjuntos.
 *
 * El ERP guarda archivos (facturas escaneadas, fotos, contratos, etc.) y la
 * implementación física vive detrás de esta interfaz: hoy disco local, mañana
 * Google Drive o OneDrive sin tocar el resto del código. La columna `provider`
 * de la tabla `Attachment` recuerda qué adapter creó cada archivo, así que
 * podemos cambiar el proveedor activo sin perder lo ya subido.
 */
export type StorageProviderId = 'local' | 'gdrive' | 'onedrive';

export interface UploadInput {
  /** Nombre lógico del schema del tenant (ej. `tenant_acme`). */
  tenantSchema: string;
  /** Tipo de entidad a la que se adjunta (`SalesInvoice`, `Item`, etc.). */
  entityType: string;
  /** ID de la entidad. */
  entityId: string;
  fileName: string;
  mime: string;
  /**
   * Contenido a subir. Aceptamos Buffer (caso multer en disco) o ReadableStream
   * (futuras integraciones con streams). Cada adapter decide cómo consumirlo.
   */
  content: Buffer;
  /**
   * Segmentos de subcarpeta REAL dentro de `entityId` (ya saneados por el
   * llamador — ver core/storage/folderName.ts). Opcional: sin esto, el
   * archivo va directo en la carpeta de la entidad, como antes.
   */
  subPath?: string[];
}

export interface DownloadInput {
  tenantSchema: string;
  externalId: string;
}

export interface DeleteInput {
  tenantSchema: string;
  externalId: string;
}

export interface StoredObjectRef {
  /**
   * Identificador estable del objeto dentro del backend del adapter:
   *  - Local: ruta relativa a la base path.
   *  - Drive: fileId.
   *  - OneDrive: driveItem id.
   */
  externalId: string;
  size: number;
  mime: string;
  fileName: string;
}

export interface DownloadResult {
  /** Stream de lectura listo para encadenar a `res.pipe()`. */
  stream: NodeJS.ReadableStream;
  size: number;
  mime: string;
  fileName: string;
}

export interface HealthCheckResult {
  ok: boolean;
  detail?: string;
}

export interface StorageAdapter {
  readonly id: StorageProviderId;
  upload(input: UploadInput): Promise<StoredObjectRef>;
  download(input: DownloadInput): Promise<DownloadResult>;
  delete(input: DeleteInput): Promise<void>;
  /** Diagnóstico: ¿el proveedor está configurado y operativo? */
  healthCheck(): Promise<HealthCheckResult>;
}
