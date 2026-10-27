import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { openFromAlarm } from '@/lib/offer-screen';

/** Tocar la alarma o un aviso abre su pantalla (la oportunidad o la ruta), también si la app estaba cerrada. */
function useNotificationTaps() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url !== 'string' || !url.startsWith('/')) {
        return;
      }
      // Si el inicio ya abrió esta oportunidad, no se pone otra encima
      const offerId = url.match(/^\/oferta\/(\d+)/)?.[1];
      if (offerId && !openFromAlarm(offerId)) {
        return;
      }
      router.push(url as never);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      open(response);
      Notifications.clearLastNotificationResponse();
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
}

export default function AppLayout() {
  useNotificationTaps();
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* La oportunidad ocupa toda la pantalla, como una llamada entrante (audio de Fran del 21/10) */}
      <Stack.Screen name="oferta/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="ruta/[id]" options={{ title: 'Tu ruta' }} />
      <Stack.Screen name="entregar/[id]" options={{ title: 'Entregar' }} />
      <Stack.Screen name="novedad/[id]" options={{ title: 'Reportar novedad' }} />
      <Stack.Screen name="incidencia/[id]" options={{ title: 'Incidencia de ruta' }} />
      <Stack.Screen name="via" options={{ title: 'En la vía' }} />
    </Stack>
  );
}
