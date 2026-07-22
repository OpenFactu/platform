export interface Kiosk {
  id: string;
  name: string;
  location: string | null;
  token: string;
  isActive: boolean;
  [key: string]: unknown;
}
