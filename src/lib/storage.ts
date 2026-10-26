import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// La sesión del rider. En el teléfono va en el almacén seguro; en la vista previa del navegador (donde SecureStore no
// existe) va en el localStorage.
export const SESSION_KEY = 'nuviora-rider-session';

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // sin almacenamiento: la sesión dura lo que la pestaña
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // nada que borrar
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
