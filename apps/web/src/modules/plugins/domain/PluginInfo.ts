export interface PluginInfo {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  logo?: string;
  isActive: boolean;
  ui?: any;
}
