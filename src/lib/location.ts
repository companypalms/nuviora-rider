import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { api, restoreToken } from './api';

// La ubicación del rider para que el sistema sepa a quién darle una orden (§6, §7). En el teléfono va con el servicio
// de ubicación de Android (src/background.ts): sigue con la app cerrada o la pantalla apagada y deja una notificación
// fija mientras corre. En la vista previa web, solo con la pestaña abierta. Cada 30 s, aunque no se mueva (lo dice el
// servidor), en lotes: si no hay señal, se guardan y salen juntas.
export const LOCATION_TASK = 'nuviora-ubicacion';

type Point = { lat: number; lng: number; accuracy: number | null; speed: number | null; recorded_at: string };

let queue: Point[] = [];
let subscription: Location.LocationSubscription | null = null;
let flushing = false;

const toPoint = (pos: Location.LocationObject): Point => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy ?? null,
  speed: pos.coords.speed ?? null,
  recorded_at: new Date(pos.timestamp).toISOString(),
});

async function flush() {
  if (flushing || queue.length === 0) {
    return;
  }
  flushing = true;
  const batch = queue.slice(0, 200);
  try {
    await api('/rider/locations', { body: { points: batch } });
    queue = queue.slice(batch.length);
  } catch {
    // sin señal: se manda en la próxima (se guardan hasta 500)
    queue = queue.slice(-500);
  } finally {
    flushing = false;
  }
}

/** Lo que llama la tarea de segundo plano con cada lote del GPS. Sin sesión guardada no manda nada. */
export async function uploadLocations(locations: Location.LocationObject[]): Promise<void> {
  if (!(await restoreToken())) {
    return;
  }
  queue.push(...locations.map(toPoint));
  await flush();
}

export type LocationState = 'siempre' | 'en_uso' | 'negado';

/**
 * Pide los permisos y empieza a mandar la ubicación. Devuelve el permiso que quedó. Android pide "Permitir siempre"
 * aparte, después de "Mientras la app está en uso" (a veces abre los ajustes): §6.1 lo necesita para dar rondas.
 */
export async function startLocation(everySeconds = 30, everyMeters = 0, ask = true): Promise<LocationState> {
  const fg = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return 'negado';
  }
  if (Platform.OS === 'web') {
    if (!subscription) {
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: everySeconds * 1000, distanceInterval: everyMeters },
        (pos) => {
          queue.push(toPoint(pos));
          void flush();
        },
      );
    }
    return 'en_uso';
  }

  let bg = await Location.getBackgroundPermissionsAsync();
  if (ask && bg.status !== 'granted' && bg.canAskAgain) {
    bg = await Location.requestBackgroundPermissionsAsync();
  }
  // El servicio de Android sigue con la pantalla apagada aunque el permiso sea solo "mientras se usa", porque arranca
  // con la app abierta; el servidor igual pide "siempre" para mandarle rondas (§6.1).
  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: everySeconds * 1000,
      distanceInterval: everyMeters,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Nuviora Rider',
        notificationBody: 'Compartiendo tu ubicación con el centro para recibir órdenes.',
        notificationColor: '#0073ff',
        killServiceOnDestroy: false,
      },
    });
  }
  return bg.status === 'granted' ? 'siempre' : 'en_uso';
}

export async function stopLocation(): Promise<void> {
  subscription?.remove();
  subscription = null;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
