import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from '@/components/safe-area-view';
import { Chip } from 'heroui-native/chip';
import { Button, Card, Notice, Row } from '@/components/ui';
import { isNewPushToken, registerDevice, type DeviceReport } from '@/lib/alarm';
import { api, type Assignment, type Me, type Offer } from '@/lib/api';
import { askToIgnoreBatteryOptimization, batteryRestricted, isXiaomi, openAppSettings } from '@/lib/battery';
import { money } from '@/lib/format';
import { startLocation, stopLocation, type LocationState } from '@/lib/location';
import { useSession } from '@/lib/session';
import { getItem, setItem } from '@/lib/storage';

const POLL_MS = 4000;
const XIAOMI_DONE_KEY = 'nuviora-rider-xiaomi-bateria';

// Inicio del rider: no hay botón "Disponible" (§6). La app espera la oportunidad (que llega como alarma en la app
// compilada; aquí también se revisa cada pocos segundos), muestra lo que tiene en curso y manda su ubicación.
export default function Home() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [openOffers, setOpenOffers] = useState<Offer[]>([]);
  const [locationState, setLocationState] = useState<LocationState | null>(null);
  const [device, setDevice] = useState<DeviceReport | null>(null);
  const [batterySaver, setBatterySaver] = useState(false);
  const [xiaomiDone, setXiaomiDone] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const opened = useRef(new Set<number>());

  const load = useCallback(async () => {
    try {
      const [offers, current] = await Promise.all([
        api<{ offers: Offer[] }>('/rider/offers'),
        api<{ assignments: Assignment[] }>('/rider/assignment'),
      ]);
      setAssignments(current.assignments);
      setOpenOffers(offers.offers);
      setError(null);
      const fresh = offers.offers.find((o) => !opened.current.has(o.id));
      if (fresh) {
        opened.current.add(fresh.id);
        router.push(`/oferta/${fresh.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    }
  }, [router]);

  // Al entrar: los permisos, el GPS y el registro del teléfono para la alarma (§6.1). Al volver a la app se revisa
  // otra vez sin preguntar, por si el rider cambió un permiso en los ajustes.
  const setup = useCallback(async (ask: boolean) => {
    try {
      const data = await api<Me>('/rider/me');
      setMe(data);
      const state = await startLocation(data.location.every_seconds, data.location.every_meters, ask).catch(() => 'negado' as const);
      setLocationState(state);
      // En la vista previa web no hay alarma: no hay nada que registrar ni que avisar
      if (Platform.OS !== 'web') {
        setDevice(await registerDevice(state, ask));
      }
      // Al volver de los ajustes se revisa otra vez: el aviso se va solo cuando el rider lo quitó
      setBatterySaver(await batteryRestricted());
      if (isXiaomi) {
        setXiaomiDone((await getItem(XIAOMI_DONE_KEY)) === '1');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil.');
    }
  }, []);

  useEffect(() => {
    // setup es asíncrono: el estado cambia después de las respuestas, no dentro del efecto
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void setup(true);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void setup(false);
      }
    });
    // Firebase puede cambiar el token del teléfono: el servidor necesita el nuevo para que siga llegando la alarma
    const tokenSub = Platform.OS !== 'web'
      ? Notifications.addPushTokenListener(({ data }) => {
          if (isNewPushToken(String(data))) {
            void setup(false);
          }
        })
      : null;
    return () => {
      sub.remove();
      tokenSub?.remove();
    };
  }, [setup]);

  const markXiaomiDone = async () => {
    setXiaomiDone(true);
    await setItem(XIAOMI_DONE_KEY, '1');
  };

  const leave = async () => {
    await stopLocation().catch(() => undefined);
    await signOut();
  };

  useFocusEffect(useCallback(() => {
    void load();
    // Al volver al inicio (por ejemplo, después de entregar), el efectivo que lleva está al día
    api<Me>('/rider/me').then(setMe).catch(() => undefined);
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="w-full max-w-xl gap-4 self-center p-5" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-foreground">Hola, {user?.names?.split(' ')[0] ?? 'rider'}</Text>
            <Text className="mt-0.5 text-sm text-muted">{me?.center ? me.center.name : 'Sin centro asignado'}</Text>
          </View>
          <Pressable onPress={leave} accessibilityRole="button" className="p-2">
            <Text className="font-bold text-accent">Salir</Text>
          </Pressable>
        </View>

        {error ? <Notice text={error} tone="error" /> : null}
        {me?.profile.suspended_at ? <Notice text="Estás suspendido: no recibes órdenes. Habla con administración." tone="error" /> : null}
        {locationState === 'negado' ? <Notice text="Activa la ubicación: sin ella no te llegan órdenes." tone="error" /> : null}
        {locationState === 'en_uso' && Platform.OS !== 'web' ? (
          <Notice text={'Falta "Permitir todo el tiempo" en la ubicación: sin eso no te llegan órdenes. Ajustes › Apps › Nuviora Rider › Permisos › Ubicación.'} tone="error" />
        ) : null}
        {device && !device.notifications ? (
          <Notice text="Las notificaciones están apagadas: no vas a oír la alarma. Actívalas en Ajustes › Apps › Nuviora Rider › Notificaciones." tone="error" />
        ) : null}
        {device?.error ? <Notice text={device.error} tone="error" /> : null}
        {batterySaver ? (
          <View className="gap-2">
            <Notice text="El ahorro de batería puede dormir la app con la pantalla apagada: no te sonaría la alarma ni se mandaría tu ubicación." tone="error" />
            <Button kind="secondary" label="Quitar el ahorro de batería" onPress={() => void askToIgnoreBatteryOptimization()} />
          </View>
        ) : null}
        {isXiaomi && !xiaomiDone ? (
          <Card title="En Xiaomi, Redmi y POCO">
            <Text className="text-base text-foreground">
              {'Estos teléfonos tienen otro ahorro de batería. En los ajustes de la app pon "Ahorro de batería" en "Sin restricciones" y activa "Inicio automático".'}
            </Text>
            <Button kind="secondary" label="Abrir los ajustes de la app" onPress={() => void openAppSettings()} />
            <Pressable onPress={() => void markXiaomiDone()} accessibilityRole="button" className="items-center p-2">
              <Text className="font-bold text-accent">Ya lo hice</Text>
            </Pressable>
          </Card>
        ) : null}
        {device?.ready ? <Notice text="Alarma lista: te sonará aunque el teléfono esté en silencio." tone="ok" /> : null}

        {me?.cash.over_limit ? (
          <Notice text={`Llegaste a USD ${me.cash.limit_usd ?? 60} en efectivo: vuelve al centro a entregarlo antes de seguir cobrando.`} tone="error" />
        ) : null}

        {openOffers.map((o) => (
          <Pressable key={o.id} onPress={() => router.push(`/oferta/${o.id}`)} accessibilityRole="button" className="gap-1 rounded-2xl bg-danger p-5">
            <Text className="text-lg font-extrabold text-danger-foreground">Tienes una asignación disponible</Text>
            <Text className="text-danger-foreground opacity-90">Toca para confirmarla antes de que venza.</Text>
          </Pressable>
        ))}

        {assignments.length === 0 ? (
          <Card>
            <View className="items-center gap-2.5 py-3">
              <View className="h-4 w-4 rounded-full bg-success" />
              <Text className="text-xl font-extrabold text-foreground">Esperando asignación</Text>
              <Text className="text-center text-base text-muted">Cuando haya una orden para ti, sonará la alarma. Tendrás 90 segundos para confirmar.</Text>
            </View>
          </Card>
        ) : (
          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-wider text-muted">En curso</Text>
            {assignments.map((a) => (
              <Pressable key={a.logistics_order_id} onPress={() => router.push(`/ruta/${a.logistics_order_id}`)} accessibilityRole="button"
                className="gap-2 rounded-2xl border-2 border-accent bg-surface p-4">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="shrink text-lg font-extrabold text-foreground">Orden {a.order.name}</Text>
                  <Chip variant="soft" color="accent" size="sm"><Chip.Label>{a.status_label}</Chip.Label></Chip>
                </View>
                {a.next_action ? <Text className="text-base text-foreground">{a.next_action}</Text> : null}
                <Text className="font-bold text-accent">Ver ruta →</Text>
              </Pressable>
            ))}
          </View>
        )}

        {me && (me.cash.usd !== 0 || me.cash.ves !== 0) ? (
          <Card title="Efectivo que llevas" tone={me.cash.over_limit ? 'accent' : undefined}>
            {me.cash.usd !== 0 ? <Row label="Dólares" value={money(me.cash.usd)} /> : null}
            {me.cash.ves !== 0 ? <Row label="Bolívares" value={`Bs ${me.cash.ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`} /> : null}
            <Text className="text-sm text-muted">Lo entregas en el centro, al operador. No se descuenta de tu pago.</Text>
          </Card>
        ) : null}

        {me?.center ? (
          <Card title="Tu centro">
            <Text className="text-base font-bold text-foreground">{me.center.name}</Text>
            {me.center.address ? <Text className="text-sm text-muted">{me.center.address}</Text> : null}
          </Card>
        ) : null}
        <Button kind="secondary" label="En la vía: tráfico, cierres, obras" onPress={() => router.push('/via')} />
        <Button kind="secondary" label="Actualizar" onPress={refresh} />
      </ScrollView>
    </SafeAreaView>
  );
}
