// Qué oportunidad está en pantalla. La abren dos caminos: tocar la alarma (src/app/(app)/_layout.tsx) y el inicio,
// que revisa cada pocos segundos si hay una nueva. Con la app cerrada, al tocar la alarma se abrían los dos y quedaba
// una repetida: después de confirmar, "atrás" mostraba la copia con "La oportunidad venció".
let onScreen: string | null = null;
// Las que ya se abrieron una vez: el inicio no vuelve a poner una que el rider dejó con "Ahora no"
const opened = new Set<string>();

/** La pantalla de la oportunidad avisa que está abierta. */
export function offerShown(id: string): void {
  onScreen = id;
  opened.add(id);
}

/** Y que se cerró: confirmada, "Ahora no" o vencida. */
export function offerClosed(id: string): void {
  if (onScreen === id) {
    onScreen = null;
  }
}

/** Al tocar la alarma: se abre, salvo que ya esté en pantalla. */
export function openFromAlarm(id: string): boolean {
  if (onScreen === id) {
    return false;
  }
  offerShown(id);
  return true;
}

/** El inicio abre cada oportunidad nueva una sola vez, y nunca una que ya está abierta. */
export function openFromHome(id: string): boolean {
  if (opened.has(id) || onScreen === id) {
    return false;
  }
  offerShown(id);
  return true;
}
