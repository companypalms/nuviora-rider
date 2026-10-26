import { Linking } from 'react-native';

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(2)}`);

const METHOD_LABELS: Record<string, string> = {
  DOLARES_EFECTIVO: 'Dólares en efectivo',
  BOLIVARES_EFECTIVO: 'Bolívares en efectivo',
  EUROS_EFECTIVO: 'Euros en efectivo',
  PAGOMOVIL: 'Pago móvil',
  TRANSFERENCIA_BANCARIA_BOLIVARES: 'Transferencia en bolívares',
  ZELLE: 'Zelle',
  BINANCE: 'Binance',
  EFECTIVO: 'Efectivo',
  Dolares: 'Dólares',
};

export const methodLabel = (m: string | null | undefined) => (m ? METHOD_LABELS[m] ?? m.replaceAll('_', ' ').toLowerCase() : '—');

export const CASH_METHODS = ['DOLARES_EFECTIVO', 'BOLIVARES_EFECTIVO', 'EUROS_EFECTIVO'];

/** Abre la navegación en Google Maps (o Waze, si el rider lo tiene como app de mapas) hasta ese punto. */
export function navigateTo(lat: number | null, lng: number | null, fallbackUrl?: string | null) {
  if (lat !== null && lng !== null) {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
  } else if (fallbackUrl) {
    void Linking.openURL(fallbackUrl);
  }
}
