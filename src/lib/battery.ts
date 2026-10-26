import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

// El ahorro de batería de Android duerme la app con la pantalla apagada: deja de mandar la ubicación y la alarma puede
// llegar tarde (§6.1: "GPS reciente", "app con notificaciones habilitadas"). Xiaomi, Redmi y POCO tienen además su propio
// ahorro, que Android no informa: se quita en los ajustes de la app.

const PACKAGE = Constants.expoConfig?.android?.package ?? 'cloud.nuviora.rider';

export const isXiaomi = Platform.OS === 'android' && /xiaomi|redmi|poco/i.test(Device.manufacturer ?? '');

/** true si Android tiene la app con el ahorro de batería (fuera de Android, nunca). */
export async function batteryRestricted(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  return Battery.isBatteryOptimizationEnabledAsync().catch(() => false);
}

/** El aviso de Android "¿Permitir que la app se ejecute siempre en segundo plano?"; si el teléfono no lo tiene, la lista. */
export async function askToIgnoreBatteryOptimization(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${PACKAGE}` });
  } catch {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS).catch(() => undefined);
  }
}

/** Los ajustes de la app (en Xiaomi: "Ahorro de batería" e "Inicio automático"). */
export async function openAppSettings(): Promise<void> {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${PACKAGE}` })
    .catch(() => undefined);
}
