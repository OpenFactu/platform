import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['public'],
  tablesFilter: [
    'Tenant',
    'GlobalUser',
    'PluginField',
    'AuditLog',
    'UserTenantMembership',
    'UserDashboardWidget',
  ],
  strict: false,
});
