/* eslint-disable import/namespace -- los enums de Android de expo-notifications llegan por "export *" desde sus .types;
   el plugin de import no los sigue, pero existen (TypeScript los comprueba) */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import type { LocationState } from './location';

// La alarma de las rondas (§8, §22.1; audio de Fran del 21/10: "un tono fuerte… que no pueda evitarla"). El servidor
// manda por Firebase un mensaje solo de datos con prioridad alta; la tarea de segundo plano (src/background.ts) lo
// recibe aunque la app esté cerrada y muestra el aviso en el canal de alarma: suena por el volumen de alarma (también
// con el teléfono en silencio), vibra, no se quita deslizando y abre la oportunidad al tocarlo. No tapa la pantalla.
// El tono dura 90 s, lo mismo que una ronda (audio de Fran del 23/10: "que durara un poquito más… tampoco que le tape
// toda la pantalla"). Si la ronda vence antes, el servidor manda "vencida" y se apaga.

// Un canal no cambia su sonido después de creado: si el tono cambia, el canal necesita otro nombre y el viejo se borra.
export const ALARM_CHANNEL = 'alarma-v2';
const OLD_ALARM_CHANNELS = ['alarma-v1'];
export const NOTICE_CHANNEL = 'avisos';
export const NOTIFICATION_TASK = 'nuviora-notificaciones';

type Push = { type?: string; offer_id?: string; logistics_order_id?: string; seconds?: string; center?: string };

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  for (const old of OLD_ALARM_CHANNELS) {
    await Notifications.deleteNotificationChannelAsync(old).catch(() => undefined);
  }
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
    name: 'Asignaciones (alarma)',
    description: 'Suena aunque el teléfono esté en silencio: hay una orden para confirmar.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'alarma_90s.wav',
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    bypassDnd: true,
    enableVibrate: true,
    vibrationPattern: [0, 700, 300, 700, 300, 700, 300, 700],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(NOTICE_CHANNEL, {
    name: 'Avisos',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

const offerKey = (offerId: string) => `oferta-${offerId}`;

/** Quita la alarma de una oportunidad (y con ella el tono). */
export async function stopAlarm(offerId: string | number): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.dismissNotificationAsync(offerKey(String(offerId))).catch(() => undefined);
}

/** Lo que hace la app con cada mensaje del servidor (Dispatcher y la alarma de prueba del Admin). */
export async function handlePush(raw: Record<string, unknown>): Promise<void> {
  const push: Push = typeof raw.dataString === 'string' ? JSON.parse(raw.dataString) : (raw as Push);
  await ensureChannels();
  const present = (identifier: string, channelId: string, title: string, body: string, url: string | null, sticky = false) =>
    Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data: url ? { url } : {}, sticky, autoDismiss: true, priority: Notifications.AndroidNotificationPriority.MAX, color: '#d93a40' },
      trigger: { channelId },
    });

  switch (push.type) {
    case 'oferta':
      // §8.1: sin destino, ni zona, ni pago
      await present(offerKey(push.offer_id ?? ''), ALARM_CHANNEL, 'Tienes una asignación disponible',
        `Confirma en ${push.seconds ?? 90} s si puedes ir ya a ${push.center || 'el centro'}.`, `/oferta/${push.offer_id}`, true);
      break;
    case 'prueba':
      await present('prueba', ALARM_CHANNEL, 'Alarma de prueba', 'Si la oíste con el teléfono en silencio, todo está listo.', null);
      break;
    case 'cubierta':
    case 'cancelada':
      await stopAlarm(push.offer_id ?? '');
      // §22.1: "Mensaje 'Ya otro rider aceptó' cuando corresponda"
      await present(`fin-${push.offer_id}`, NOTICE_CHANNEL, push.type === 'cubierta' ? 'Ya otro rider aceptó' : 'La asignación se canceló',
        'No tienes que hacer nada.', null);
      break;
    case 'vencida':
      // La ronda terminó sin que confirmara: el tono no sigue sonando después de la ronda
      await stopAlarm(push.offer_id ?? '');
      break;
    case 'asignada':
      await present(`asignada-${push.logistics_order_id}`, NOTICE_CHANNEL, 'Te asignaron una orden', 'Abre la app para ver tu ruta.',
        `/ruta/${push.logistics_order_id}`);
      break;
  }
}

export type DeviceReport = { ready: boolean; notifications: boolean; error: string | null };

// El último token de Firebase que se mandó al servidor
let knownToken: string | null = null;

/**
 * Expo avisa "token nuevo" cada vez que la app pide el token, no solo cuando Firebase lo cambia. Volver a registrar el
 * teléfono con ese aviso lo pedía otra vez: un bucle de cientos de llamadas por minuto. Solo cuenta si es otro token.
 */
export function isNewPushToken(token: string): boolean {
  return token !== knownToken;
}

/**
 * Registra el teléfono en Nuviora (§6.1: "app con notificaciones habilitadas… permisos de ubicación"): el token de
 * Firebase, si las notificaciones están permitidas y el permiso de ubicación. Sin esto no le llegan rondas.
 */
export async function registerDevice(location: LocationState, ask = true): Promise<DeviceReport> {
  if (Platform.OS === 'web') {
    return { ready: false, notifications: false, error: null };
  }
  // En Android 13+ el permiso de notificaciones se pide después de crear un canal
  await ensureChannels();
  let permission = await Notifications.getPermissionsAsync();
  if (ask && permission.status !== 'granted' && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  const notifications = permission.status === 'granted';
  let pushToken: string | null = null;
  let error: string | null = null;
  try {
    pushToken = (await Notifications.getDevicePushTokenAsync()).data as string;
    knownToken = pushToken;
  } catch {
    error = 'No se pudo registrar la alarma en este teléfono. Revisa el internet y vuelve a abrir la app.';
  }
  const res = await api<{ ready: boolean }>('/rider/device', {
    body: {
      ...(pushToken ? { push_target_type: 'token', push_target: pushToken } : {}),
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      notifications_enabled: notifications,
      location_permission: location,
    },
  });
  return { ready: res.ready, notifications, error };
}
