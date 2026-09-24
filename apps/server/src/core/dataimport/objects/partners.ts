/**
 * Interlocutores: clientes y proveedores, con su dirección principal.
 *
 * Va en su propio fichero porque es el único objeto con `transform`: las
 * columnas de dirección del Excel son planas y el endpoint espera un array
 * `addresses`.
 */

import type { ImportObjectConfig } from '../ImportRegistry';
import partnersRouter from '../../../api/partners';

export const partnerObject: ImportObjectConfig = {
  id: 'partner',
  label: 'Interlocutores',
  description: 'Clientes y proveedores, con su dirección principal.',
  group: 'maestros',
  modulePath: '/partners',
  featureFlag: 'partnersEnabled',
  table: 'BusinessPartner',

  router: () => partnersRouter,
  createPath: '/',
  updatePath: (id) => `/${id}`,
  updateMethod: 'PATCH',
  deletePath: (id) => `/${id}`,
  dependsOn: ['partnerGroup'],

  naturalKeys: [
    // `code` es UNIQUE y `nif` tiene índice único parcial (mig 029). El
    // nombre no: dos empresas pueden llamarse igual, así que sirve para
    // buscar pero no para avisar de duplicados.
    { key: 'code', column: 'code', label: 'Código', unique: true },
    { key: 'nif', column: 'nif', label: 'NIF/CIF', unique: true },
    { key: 'name', column: 'name', label: 'Nombre' },
  ],

  fields: [
    {
      key: 'code',
      label: 'Código',
      type: 'string',
      example: 'CLI-00001',
      help: 'Si se deja vacío y el interlocutor tiene grupo con prefijo, se autogenera correlativo.',
    },
    {
      key: 'name',
      label: 'Nombre o razón social',
      type: 'string',
      required: 'onInsert',
      example: 'Ferretería Pérez S.L.',
    },
    {
      key: 'nif',
      label: 'NIF/CIF',
      type: 'string',
      example: 'B12345678',
      help: 'Se valida contra el formato del país indicado en "País". Sin país no se valida.',
    },
    { key: 'foreignName', label: 'Nombre comercial', type: 'string' },
    { key: 'countryCode', label: 'País (ISO)', type: 'string', example: 'ES' },
    { key: 'email', label: 'Email', type: 'string', example: 'compras@ferreteriaperez.es' },
    { key: 'phone', label: 'Teléfono', type: 'string', example: '963 123 456' },
    { key: 'website', label: 'Web', type: 'string' },
    {
      key: 'group',
      label: 'Grupo',
      type: 'ref',
      bodyKey: 'groupId',
      example: 'CLIENTES',
      ref: { table: 'PartnerGroup', matchBy: ['code', 'name'], label: 'grupo de interlocutores' },
    },
    {
      key: 'priceList',
      label: 'Lista de precios',
      type: 'ref',
      bodyKey: 'priceListId',
      ref: { table: 'PriceList', matchBy: ['name'], label: 'lista de precios' },
    },
    { key: 'iban', label: 'IBAN', type: 'string', help: 'Se valida el dígito de control.' },
    { key: 'bankName', label: 'Banco', type: 'string' },
    { key: 'bankSwift', label: 'SWIFT/BIC', type: 'string' },
    {
      key: 'defaultWithholdingRate',
      label: 'Retención por defecto (%)',
      type: 'number',
      example: '15',
    },

    // Dirección principal — columnas planas que el transform agrupa.
    {
      key: 'street',
      label: 'Dirección · Calle',
      type: 'string',
      bodyKey: 'address.street',
      nested: true,
      example: 'C/ Mayor 12',
    },
    {
      key: 'city',
      label: 'Dirección · Ciudad',
      type: 'string',
      bodyKey: 'address.city',
      nested: true,
      example: 'Valencia',
    },
    {
      key: 'state',
      label: 'Dirección · Provincia',
      type: 'string',
      bodyKey: 'address.state',
      nested: true,
    },
    {
      key: 'zipCode',
      label: 'Dirección · Código postal',
      type: 'string',
      bodyKey: 'address.zipCode',
      nested: true,
      example: '46001',
    },
    {
      key: 'addressCountry',
      label: 'Dirección · País',
      type: 'string',
      bodyKey: 'address.country',
      nested: true,
    },
  ],

  /**
   * Las columnas de dirección viajan como `addresses: [...]`, que es lo que
   * espera el endpoint. Solo se envía si venía algo: en modo actualización,
   * mandar un `addresses` vacío BORRARÍA las direcciones existentes
   * (`partners.ts` las reemplaza en bloque cuando recibe la clave).
   */
  transform: (body) => {
    const { address, ...rest } = body;
    const hasAddress =
      address && Object.values(address).some((v) => v !== null && v !== undefined && v !== '');
    if (!hasAddress) return rest;
    return {
      ...rest,
      addresses: [
        {
          ...address,
          name: 'Principal',
          countryCode: address.countryCode || rest.countryCode || null,
          isDefault: true,
        },
      ],
    };
  },
};
