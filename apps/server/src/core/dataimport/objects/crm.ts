/**
 * CRM: contactos y oportunidades (también de prospectos sin ficha de cliente).
 * Las actividades quedan fuera: son historial, y cargar un histórico de
 * llamadas sin fechas ni responsables fiables ensucia más que ayuda.
 */

import type { ImportObjectConfig } from '../ImportRegistry';
import crmContactsRouter from '../../../api/crm/contacts';
import crmOpportunitiesRouter from '../../../api/crm/opportunities';

const partnerRef = {
  table: 'BusinessPartner',
  matchBy: ['code', 'nif', 'name'],
  label: 'interlocutor',
};

export const crmObjects: ImportObjectConfig[] = [
  {
    id: 'crmContact',
    label: 'Contactos',
    description: 'Las personas de cada cliente o proveedor.',
    group: 'crm',
    modulePath: '/crm/contacts',
    featureFlag: 'crmEnabled',
    table: 'Contact',
    router: () => crmContactsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    dependsOn: ['partner'],
    naturalKeys: [{ key: 'email', column: 'email', label: 'Email' }],
    fields: [
      {
        key: 'partner',
        label: 'Interlocutor',
        type: 'ref',
        bodyKey: 'partnerId',
        required: 'onInsert',
        ref: partnerRef,
        example: 'CLI-00001',
      },
      { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Ana López' },
      { key: 'role', label: 'Cargo', type: 'string', example: 'Compras' },
      { key: 'email', label: 'Email', type: 'string', example: 'ana@empresa.com' },
      { key: 'phone', label: 'Teléfono', type: 'string' },
      { key: 'mobile', label: 'Móvil', type: 'string' },
      { key: 'isMain', label: '¿Principal?', type: 'boolean', example: 'Sí' },
      { key: 'notes', label: 'Notas', type: 'string' },
    ],
  },
  {
    id: 'crmOpportunity',
    label: 'Oportunidades',
    description: 'El embudo comercial. Sin interlocutor, se crean como prospecto.',
    group: 'crm',
    modulePath: '/crm/opportunities',
    featureFlag: 'crmEnabled',
    table: 'Opportunity',
    router: () => crmOpportunitiesRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    dependsOn: ['partner', 'crmContact'],
    naturalKeys: [{ key: 'title', column: 'title', label: 'Título' }],
    fields: [
      {
        key: 'title',
        label: 'Título',
        type: 'string',
        required: 'onInsert',
        example: 'Renovación 2027',
      },
      {
        key: 'partner',
        label: 'Interlocutor',
        type: 'ref',
        bodyKey: 'partnerId',
        ref: partnerRef,
        help: 'Déjalo vacío para un prospecto y rellena Empresa o Nombre del prospecto.',
      },
      { key: 'prospectCompany', label: 'Empresa del prospecto', type: 'string' },
      { key: 'prospectName', label: 'Nombre del prospecto', type: 'string' },
      { key: 'prospectEmail', label: 'Email del prospecto', type: 'string' },
      { key: 'prospectPhone', label: 'Teléfono del prospecto', type: 'string' },
      {
        key: 'stage',
        label: 'Etapa',
        type: 'ref',
        bodyKey: 'stageId',
        ref: { table: 'OpportunityStage', matchBy: ['name', 'id'], label: 'etapa' },
        help: 'Vacío = la primera etapa abierta del embudo.',
        example: 'Propuesta',
      },
      { key: 'amount', label: 'Importe', type: 'number', example: '1500' },
      { key: 'expectedCloseDate', label: 'Cierre previsto', type: 'date', example: '2027-03-31' },
      { key: 'source', label: 'Origen', type: 'string', example: 'Feria' },
      {
        key: 'lostReason',
        label: 'Motivo de pérdida',
        type: 'string',
        help: 'Obligatorio si la etapa es de tipo perdida.',
      },
      { key: 'notes', label: 'Notas', type: 'string' },
    ],
  },
];
