import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { stopAlarm } from '@/lib/alarm';
import { api, ApiError, type Offer } from '@/lib/api';

// La oportunidad (§8, §8.1, §22.1): a pantalla completa, con su temporizador. No dice nada del destino: ni zona, ni
// cliente, ni km, ni pago. El primero que confirma gana (§8.2); si otro ganó, lo dice.
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ offers: Offer[] }>('/rider/offers').then((res) => {
      const found = res.offers.find((o) => String(o.id) === String(id)) ?? null;
      setOffer(found);
      if (!found) {
        setResult('Esta oportunidad ya no está disponible.');
        void stopAlarm(String(id));
      }
    }).catch(() => setResult('No se pudo cargar la oportunidad.'));
    void api(`/rider/offers/${id}/seen`, { method: 'POST' }).catch(() => undefined);
    Vibration.vibrate([0, 600, 400, 600, 400, 600]);
    return () => Vibration.cancel();
  }, [id]);

  useEffect(() => {
    if (!offer) {
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [offer]);

  // La alarma sigue sonando con la pantalla abierta: se apaga al confirmar, al decir "Ahora no" o al vencer
  const leave = () => {
    void stopAlarm(String(id));
    router.back();
  };

  useEffect(() => {
    if (left === 0) {
      void stopAlarm(String(id));
    }
  }, [left, id]);

  const confirm = async () => {
    setBusy(true);
    Vibration.cancel();
    void stopAlarm(String(id));
    try {
      const res = await api<{ message: string; logistics_order_id: number }>(`/rider/offers/${id}/confirm`, { method: 'POST' });
      router.replace(`/ruta/${res.logistics_order_id}`);
    } catch (e) {
      setResult(e instanceof ApiError ? e.message : 'No se pudo confirmar. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  const expired = left === 0;
  const clock = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '--:--';

  return (
    <SafeAreaView className="flex-1 bg-danger">
      <View className="w-full max-w-lg flex-1 justify-center gap-6 self-center p-7">
        <Text className="text-sm font-extrabold uppercase tracking-widest text-danger-foreground opacity-90">
          {offer ? `Ronda ${offer.round}` : 'Asignación'}
        </Text>
        {result ? (
          <>
            <Text className="text-2xl font-bold leading-8 text-danger-foreground">{result}</Text>
            <Button kind="alarm" label="Volver" onPress={leave} />
          </>
        ) : (
          <>
            <Text className="text-8xl font-extrabold text-danger-foreground" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`Quedan ${left ?? 0} segundos`}>{clock}</Text>
            <Text className="text-2xl font-bold leading-8 text-danger-foreground">{offer?.message ?? 'Debes poder dirigirte al centro logístico inmediatamente.'}</Text>
            {/* §14.2: un reemplazo no recoge en el centro sino donde está el otro rider (se ve al confirmar) */}
            {offer?.replacement ? null : (
              <View className="gap-1 rounded-2xl bg-black/15 p-5">
                <Text className="text-sm text-danger-foreground opacity-80">Recoges en</Text>
                <Text className="text-xl font-extrabold text-danger-foreground">{offer?.center.name ?? '…'}</Text>
                {offer?.center.address ? <Text className="text-danger-foreground opacity-90">{offer.center.address}</Text> : null}
              </View>
            )}
            <Button kind="alarm" label={expired ? 'La oportunidad venció' : 'Confirmar disponibilidad'} onPress={confirm} loading={busy} disabled={expired || !offer} />
            <Text className="p-2 text-center text-base text-danger-foreground opacity-85" onPress={leave}>Ahora no</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
