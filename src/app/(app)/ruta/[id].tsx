import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Chip } from 'heroui-native/chip';
import { Button, Card, Notice, Row } from '@/components/ui';
import { api, ApiError, type Assignment } from '@/lib/api';
import { methodLabel, money, navigateTo } from '@/lib/format';

const ON_STREET = ['en_via'];
const AT_CENTER = ['rider_confirmado', 'preparando', 'listo_despacho'];
const RETURNING = 'retorno_pendiente';
const HANDING_OVER = 'reemplazo';

// La ruta del rider (§9.1, §22.2, §22.3): primero el centro para recoger; con la salida confirmada por el operador, el
// cliente, el cobro y los botones de "Entregado", "Reportar novedad" y "Reportar incidencia de ruta". No puede cambiar
// el orden ni la ruta (§30). Si la orden no se entregó, solo queda devolver el producto al centro (§16.1). Con una
// incidencia (§14), el reemplazo recoge el paquete donde está el otro rider y confirma "Recibí el paquete".
export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Assignment | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ assignments: Assignment[] }>('/rider/assignment');
      const found = res.assignments.find((x) => String(x.logistics_order_id) === String(id)) ?? null;
      setA(found);
      setGone(!found);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ruta.');
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]));

  if (gone) {
    return (
      <View className="w-full max-w-xl flex-1 gap-4 self-center bg-background p-5">
        <Notice tone="ok" text="Esta orden ya no está en curso (entregada o cerrada)." />
        <Button label="Volver al inicio" onPress={() => router.replace('/')} />
      </View>
    );
  }
  if (!a) {
    return (
      <View className="flex-1 bg-background p-5">
        {error ? <Notice tone="error" text={error} /> : <Text className="text-muted">Cargando…</Text>}
      </View>
    );
  }

  const onStreet = ON_STREET.includes(a.status);
  const returning = a.status === RETURNING;
  // §14: el que tuvo la incidencia espera con el paquete; el reemplazo lo recoge donde está él, no en el centro
  const handingOver = a.status === HANDING_OVER;
  const pickup = a.pickup;
  const atCenter = (AT_CENTER.includes(a.status) && !pickup) || returning;
  const client = a.client;

  const received = async () => {
    setBusy(true);
    setError(null);
    let coords: { lat?: number; lng?: number } = {};
    try {
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // sin ubicación, se confirma igual
    }
    try {
      await api(`/rider/assignment/${a.logistics_order_id}/transfer`, { body: coords });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo confirmar. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-xl gap-3.5 self-center p-5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="shrink text-2xl font-extrabold text-foreground">Orden {a.order.name}</Text>
        <Chip variant="soft" color={onStreet ? 'success' : 'accent'} size="sm"><Chip.Label>{a.status_label}</Chip.Label></Chip>
      </View>
      {a.next_action ? <Notice tone={onStreet ? 'ok' : 'warn'} text={a.next_action} /> : null}
      {a.open_novelty ? (
        <Notice tone="error" text={a.open_novelty.owner === 'ventas' ? 'Tu novedad está con la vendedora: espera instrucciones.' : 'Novedad enviada: el operador la está viendo.'} />
      ) : null}
      {a.open_incident?.status === 'abierta' ? (
        <Notice tone="error" text="Incidencia enviada: el operador decide si sigues o si viene otro rider a buscar el paquete." />
      ) : null}
      {error ? <Notice tone="error" text={error} /> : null}

      {pickup ? (
        <Card title="Recoge el paquete" tone="accent">
          <Text className="text-lg font-bold text-foreground">{pickup.name ?? 'El otro rider'}</Text>
          {pickup.phone ? (
            <Row label="Teléfono" value={<Text className="text-accent underline" onPress={() => Linking.openURL(`tel:${pickup.phone}`)}>{pickup.phone}</Text>} />
          ) : null}
          {pickup.latitude !== null && pickup.longitude !== null
            ? <Button label="Ir donde está" onPress={() => navigateTo(pickup.latitude, pickup.longitude, null)} /> : null}
          <Button kind="ok" label="Recibí el paquete" onPress={received} loading={busy} />
        </Card>
      ) : handingOver ? null : (
        <Card title={returning ? 'Devuelve en el centro' : atCenter ? 'Recoge en el centro' : 'Centro'} tone={atCenter ? 'accent' : undefined}>
          <Text className="text-lg font-bold text-foreground">{a.center.name}</Text>
          {a.center.address ? <Text className="text-muted">{a.center.address}</Text> : null}
          {atCenter ? <Button label="Ir al centro" onPress={() => navigateTo(a.center.latitude, a.center.longitude, a.center.maps_url)} /> : null}
        </Card>
      )}

      {client ? (
        <Card title="Cliente" tone={onStreet ? 'accent' : undefined}>
          <Row label="Nombre" value={client.name || '—'} />
          {client.phone ? (
            <Row label="Teléfono" value={<Text className="text-accent underline" onPress={() => Linking.openURL(`tel:${client.phone}`)}>{client.phone}</Text>} />
          ) : null}
          {client.address ? <Row label="Dirección" value={client.address} /> : null}
          {a.order.courier_shipment ? <Notice text="Va a una oficina de encomiendas (MRW, Tealca, Zoom…): el punto es la oficina." /> : null}
          {onStreet ? <Button label="Ir al cliente" onPress={() => navigateTo(client.latitude, client.longitude, client.location)} /> : null}
        </Card>
      ) : null}

      {returning || handingOver ? null : <Card title="Cobro">
        <Row label="Total a cobrar" value={money(a.order.total)} />
        {a.order.payments.length > 0
          ? a.order.payments.map((p, i) => <Row key={i} label={methodLabel(p.method)} value={money(p.amount)} />)
          : <Row label="Método" value={methodLabel(a.order.payment_method)} />}
        {a.estimated_pay !== null ? <Row label="Tu pago estimado" value={money(a.estimated_pay)} /> : null}
      </Card>}

      {onStreet && !a.open_novelty && !a.open_incident ? (
        <View className="mt-1 gap-3">
          <Button kind="ok" label="Entregado" onPress={() => router.push(`/entregar/${a.logistics_order_id}`)} />
          <Button kind="secondary" label="Reportar novedad" onPress={() => router.push(`/novedad/${a.logistics_order_id}`)} />
          <Button kind="secondary" label="Reportar incidencia de ruta" onPress={() => router.push(`/incidencia/${a.logistics_order_id}`)} />
        </View>
      ) : null}
    </ScrollView>
  );
}
