export interface DepartmentDef {
  code: string;
  name: string;
  color: string;
}

export const DEPARTMENTS: Record<string, DepartmentDef> = {
  MEYVE_SEBZE: { code: 'MEYVE_SEBZE', name: 'Meyve & Sebze', color: '#3f9b3a' },
  ICECEK: { code: 'ICECEK', name: 'İçecek', color: '#1f6fd1' },
  GIDA: { code: 'GIDA', name: 'Temel Gıda', color: '#d98a1c' },
  KAHVALTILIK: { code: 'KAHVALTILIK', name: 'Kahvaltılık', color: '#c2541f' },
  ATISTIRMALIK: { code: 'ATISTIRMALIK', name: 'Atıştırmalık', color: '#d4312c' },
  SUT_URUNLERI: { code: 'SUT_URUNLERI', name: 'Süt Ürünleri', color: '#4aa3d8' },
  TEMIZLIK: { code: 'TEMIZLIK', name: 'Temizlik', color: '#7a4fc9' },
  KISISEL_BAKIM: { code: 'KISISEL_BAKIM', name: 'Kişisel Bakım', color: '#c94f9b' },
  PROMOSYON: { code: 'PROMOSYON', name: 'Kampanya', color: '#e8b10d' },
};

/** Gondol sıraları için soldan sağa reyon dizilimi. */
export const GONDOLA_DEPARTMENT_ORDER = ['TEMIZLIK', 'KISISEL_BAKIM', 'GIDA', 'KAHVALTILIK', 'ATISTIRMALIK', 'ICECEK'];
