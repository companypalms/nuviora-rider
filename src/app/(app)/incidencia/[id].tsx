import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { RadioGroup } from 'heroui-native/radio-group';
import { TextField } from 'heroui-native/text-field';
import { Button, Card, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

// "Reportar incidencia de ruta" (§14.1, §22.2): una avería, un accidente, una emergencia… algo que no deja seguir. Va con
// el comentario, la ubicación y la hora; el operador decide si sigue o si manda un reemplazo.
export default function IncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [type, setType] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ types: { value: string; label: string }[] }>('/rider/incident-types').then((r) => setTypes(r.types)).catch(() => setError('No se pudieron cargar los motivos.'));
  }, []);

  const send = async () => {
    if (!type) {
      return;
    }
    setBusy(true);
    setError(null);
    let coords: { lat?: number; lng?: number } = {};
    try {
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // sin ubicación, se manda igual
    }
    try {
      await api(`/rider/assignment/${id}/incident`, { body: { type, comment: comment.trim() || null, ...coords } });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-xl gap-3.5 self-center p-5">
      <Text className="text-2xl font-extrabold text-foreground">¿Qué te pasó?</Text>
      <Text className="text-muted">Le llega al operador al momento, con tu ubicación. Si no puedes seguir, manda a otro rider a buscar el paquete.</Text>
      <Card>
        <RadioGroup value={type} onValueChange={setType} className="gap-1">
          {types.map((t) => <RadioGroup.Item key={t.value} value={t.value}>{t.label}</RadioGroup.Item>)}
        </RadioGroup>
      </Card>
      <TextField>
        <Label>Cuenta lo que pasa (opcional)</Label>
        <Input value={comment} onChangeText={setComment} multiline numberOfLines={3} placeholder="Por ejemplo: se me espichó el caucho" />
      </TextField>
      {error ? <Notice tone="error" text={error} /> : null}
      <Button label="Enviar la incidencia" onPress={send} loading={busy} disabled={!type} />
    </ScrollView>
  );
}
