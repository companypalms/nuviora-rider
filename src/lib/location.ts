import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureChannels, NOTICE_CHANNEL } from './alarm';
import { api, restoreToken } from './api';
import { getItem, setItem } from './storage';

// La ubicación del rider para que el sistema sepa a quién darle una orden (§6, §7). En el teléfono va con el servicio
// de ubicación de Android (src/background.ts): sigue con la app cerrada o la pantalla apagada y deja una notificación
// fija mientras corre. En la vista previa web, solo con la pestaña abierta. Cada 30 s, aunque no se mueva (lo dice el
// servidor), en lotes: si no hay señal, se guardan y salen juntas.
export const LOCATION_TASK = 'nuviora-ubicacion';
// Cuánto llevaba prendido el teléfono (Device.getUptimeAsync) cuando la app levantó el servicio. Vuelve a cero al
// reiniciar: si ahora es menor, el teléfono se reinició y el servicio no volvió.
const GPS_STARTED_KEY = 'nuviora-rider-gps-uptime';
const GPS_PAUSED_NOTICE = 'ubicacion-pausada';

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
  // con la app abierta; el servidor igual pide "siempre" para mandarle rondas (§6.1). Se registra siempre, aunque la
  // tarea ya figure como iniciada: después de reiniciar el teléfono Android la recuerda, pero sin el servicio, y solo
  // registrarla con la app en pantalla lo vuelve a levantar.
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
  await setItem(GPS_STARTED_KEY, String(await Device.getUptimeAsync())).catch(() => undefined);
  await Notifications.dismissNotificationAsync(GPS_PAUSED_NOTICE).catch(() => undefined);
  return bg.status === 'granted' ? 'siempre' : 'en_uso';
}

/**
 * Al prender el teléfono, Android vuelve a registrar la tarea del GPS pero no el servicio que la mantiene viva
 * (expo-location solo lo levanta con la app en pantalla): manda una ubicación y la app se congela. A los 5 minutos el
 * rider queda "sin GPS" y no le llegan órdenes (§6.1, §7). Como solo se arregla abriendo la app, se le avisa con un
 * aviso fijo; al abrirla, startLocation lo quita. Lo llaman las tareas de segundo plano (src/background.ts).
 */
export async function warnIfGpsPaused(): Promise<void> {
  if (Platform.OS !== 'android' || !(await restoreToken())) {
    return;
  }
  const startedAt = Number(await getItem(GPS_STARTED_KEY));
  if (!startedAt || (await Device.getUptimeAsync()) >= startedAt) {
    return;
  }
  const shown = await Notifications.getPresentedNotificationsAsync();
  if (shown.some((n) => n.request.identifier === GPS_PAUSED_NOTICE)) {
    return;
  }
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: GPS_PAUSED_NOTICE,
    content: {
      title: 'Abre Nuviora Rider',
      body: 'El teléfono se reinició y tu ubicación quedó en pausa: así no te llegan órdenes. Toca aquí para activarla.',
      sticky: true,
      color: '#d93a40',
    },
    trigger: { channelId: NOTICE_CHANNEL },
  });
}

export async function stopLocation(): Promise<void> {
  subscription?.remove();
  subscription = null;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
