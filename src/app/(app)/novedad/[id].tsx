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

// "Reportar novedad" (§13, §22.2): le llega primero al operador, no a la vendedora. Lo comercial lo escala él.
export default function NoveltyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [type, setType] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ types: { value: string; label: string }[] }>('/rider/novelty-types').then((r) => setTypes(r.types)).catch(() => setError('No se pudieron cargar los tipos.'));
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
      await api(`/rider/assignment/${id}/novelty`, { body: { type, description: description.trim() || null, ...coords } });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-xl gap-3.5 self-center p-5">
      <Text className="text-2xl font-extrabold text-foreground">¿Qué pasa?</Text>
      <Text className="text-muted">Le llega al operador del centro al momento.</Text>
      <Card>
        <RadioGroup value={type} onValueChange={setType} className="gap-1">
          {types.map((t) => <RadioGroup.Item key={t.value} value={t.value}>{t.label}</RadioGroup.Item>)}
        </RadioGroup>
      </Card>
      <TextField>
        <Label>Cuenta lo que pasa (opcional)</Label>
        <Input value={description} onChangeText={setDescription} multiline numberOfLines={3} placeholder="Por ejemplo: toco y nadie abre" />
      </TextField>
      {error ? <Notice tone="error" text={error} /> : null}
      <Button label="Enviar al operador" onPress={send} loading={busy} disabled={!type} />
    </ScrollView>
  );
}
