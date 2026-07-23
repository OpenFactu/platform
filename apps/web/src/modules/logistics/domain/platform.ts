export interface Platform {
  id: string;
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  openingHours: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  archivedAt: string | null;
}
