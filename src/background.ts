import type { LocationObject } from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { handlePush, NOTIFICATION_TASK } from './lib/alarm';
import { restoreToken } from './lib/api';
import { LOCATION_TASK, uploadLocations, warnIfGpsPaused } from './lib/location';

// Las tareas que Android corre con la app cerrada: la alarma de las rondas y el GPS. Tienen que definirse al cargar la
// app, antes que cualquier pantalla (index.ts las importa primero), porque Android puede arrancar la app solo para esto.
if (Platform.OS !== 'web') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
    // Un toque en un aviso también llega aquí; lo atiende la app al abrirse (src/app/(app)/_layout.tsx)
    if (error || !data || 'actionIdentifier' in data) {
      return;
    }
    // Sin sesión en este teléfono, no hay alarma
    if (!(await restoreToken())) {
      return;
    }
    await handlePush(data.data as Record<string, unknown>);
    await warnIfGpsPaused().catch(() => undefined);
  });

  // Después de reiniciar el teléfono, esta tarea corre una vez al prender: es la ocasión de avisarle que abra la app
  TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) {
      return;
    }
    await uploadLocations(data.locations);
    await warnIfGpsPaused().catch(() => undefined);
  });

  void Notifications.registerTaskAsync(NOTIFICATION_TASK).catch(() => undefined);
}
