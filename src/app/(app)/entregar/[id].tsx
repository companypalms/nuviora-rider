import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { Description } from 'heroui-native/description';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { TextField } from 'heroui-native/text-field';
import { Button, Card, Notice, Row } from '@/components/ui';
import { api, ApiError, type Assignment } from '@/lib/api';
import { CASH_METHODS, money } from '@/lib/format';

// "Entregado" (§12, §22.3): la única prueba obligatoria es la foto del comprobante (§12.1). Se sube con el mismo
// endpoint que usa la agencia y la orden pasa a "Entregado" con las reglas de comprobantes de siempre. Si el cliente pagó
// en efectivo, se anota cuánto recibió; el vuelto lo hace administración (§17.1).
export default function DeliverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Assignment | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ assignments: Assignment[] }>('/rider/assignment').then((res) => {
      setA(res.assignments.find((x) => String(x.logistics_order_id) === String(id)) ?? null);
    }).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la orden.'));
  }, [id]);

  const isCash = !!a && (a.order.payments.some((p) => CASH_METHODS.includes(p.method)) || ['EFECTIVO', 'Dolares'].includes(a.order.payment_method ?? ''));

  const takePhoto = async () => {
    setError(null);
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Hace falta permiso de cámara para la foto del comprobante.');
        return;
      }
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) {
      setPhoto(res.assets[0]);
    }
  };

  const deliver = async () => {
    if (!a || !photo) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (Platform.OS === 'web' && photo.file) {
        form.append('payment_receipt', photo.file);
      } else {
        // Expo 58 cambió el fetch de la app por el suyo, que no acepta el { uri, name, type } de React Native: la foto
        // fallaba antes de salir del teléfono y se veía "Sin conexión". Con File de expo-file-system manda los bytes.
        form.append('payment_receipt', new File(photo.uri));
      }
      await api(`/orders/${a.order.id}/payment-receipt`, { form });
      await api(`/orders/${a.order.id}/status`, {
        method: 'PUT',
        body: { status: 'Entregado', ...(isCash ? { cash_received: Number(cash.replace(',', '.')), change_covered_by: 'company' } : {}) },
      });
      // §22.3: "pasar automáticamente a siguiente parada si existe"
      const next = a.route?.next_logistics_order_id;
      router.replace(next ? `/ruta/${next}` : '/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo marcar la entrega. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  if (!a) {
    return (
      <View className="flex-1 bg-background p-5">
        {error ? <Notice tone="error" text={error} /> : <Text className="text-muted">Cargando…</Text>}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-xl gap-3.5 self-center p-5">
      <Text className="text-2xl font-extrabold text-foreground">Orden {a.order.name}</Text>
      <Card title="Foto del comprobante">
        <Text className="text-muted">La foto del pago (o de los billetes, si es efectivo). Que se lea bien: si no, no se puede entregar.</Text>
        {photo ? <Image source={{ uri: photo.uri }} className="max-h-96 w-full rounded-2xl bg-default" style={{ aspectRatio: 3 / 4 }} resizeMode="cover" accessibilityLabel="Foto del comprobante" /> : null}
        <Button kind={photo ? 'secondary' : 'primary'} label={photo ? 'Tomar otra foto' : 'Tomar foto'} onPress={takePhoto} />
      </Card>

      {isCash ? (
        <Card title="Efectivo">
          <Row label="Total a cobrar" value={money(a.order.total)} />
          <TextField isRequired>
            <Label>¿Cuánto te dio el cliente?</Label>
            <Input value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="0.00" />
            <Description>Si hay vuelto, lo hace administración por pago móvil.</Description>
          </TextField>
        </Card>
      ) : null}

      {error ? <Notice tone="error" text={error} /> : null}
      <Button kind="ok" label="Marcar entregado" onPress={deliver} loading={busy} disabled={!photo || (isCash && cash.trim() === '')} />
    </ScrollView>
  );
}
