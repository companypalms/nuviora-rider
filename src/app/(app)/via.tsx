import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { RadioGroup } from 'heroui-native/radio-group';
import { TextField } from 'heroui-native/text-field';
import { Button, Card, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { navigateTo } from '@/lib/format';

type Report = { id: number; type_label: string; comment: string | null; lat: number; lng: number; reported_at: string; reporter: string | null; still_count: number };
type Type = { value: string; label: string };

const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

// Incidencias en la vía (§15): lo que los riders ven en la calle (tráfico detenido, vía cerrada, obra…), con la ubicación.
// Se quitan solas si nadie confirma que siguen. Sirve para avisar demoras, no para evadir controles de la autoridad.
export default function RoadScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [type, setType] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reports: Report[]; types: Type[] }>('/rider/road-reports');
      setReports(r.reports);
      setTypes(r.types);
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'No se pudo cargar.', tone: 'error' });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const send = async () => {
    if (!type) {
      return;
    }
    setBusy(true);
    setMessage(null);
    let coords: { lat?: number; lng?: number } = {};
    try {
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // sin ubicación del teléfono: el servidor usa la última que mandó la app
    }
    try {
      const r = await api<{ message: string }>('/rider/road-reports', { body: { type, comment: comment.trim() || null, ...coords } });
      setMessage({ text: r.message, tone: 'ok' });
      setType(undefined);
      setComment('');
      await load();
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'No se pudo enviar. Intenta otra vez.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id: number, value: 'activo' | 'despejado') => {
    try {
      const r = await api<{ message: string }>(`/rider/road-reports/${id}/vote`, { body: { vote: value } });
      setMessage({ text: r.message, tone: 'ok' });
      await load();
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'No se pudo guardar.', tone: 'error' });
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-xl gap-3.5 self-center p-5">
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Text className="text-xs font-bold uppercase tracking-wider text-muted">Ahora en la vía</Text>
      {reports.length === 0 ? <Text className="text-muted">Nadie reportó nada.</Text> : null}
      {reports.map((r) => (
        <Card key={r.id}>
          <Text className="text-base font-bold text-foreground">{r.type_label}</Text>
          {r.comment ? <Text className="text-foreground">{r.comment}</Text> : null}
          <Text className="text-sm text-muted">
            {r.reporter ?? 'Un rider'} a las {hour(r.reported_at)}{r.still_count > 0 ? ` · ${r.still_count} lo confirmaron` : ''}
          </Text>
          <Button kind="secondary" label="Ver en el mapa" onPress={() => navigateTo(r.lat, r.lng, null)} />
          <View className="flex-row gap-2">
            <Button kind="secondary" label="Sigue" onPress={() => void vote(r.id, 'activo')} className="flex-1" />
            <Button kind="ok" label="Ya despejado" onPress={() => void vote(r.id, 'despejado')} className="flex-1" />
          </View>
        </Card>
      ))}

      <Text className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">Reportar algo en la vía</Text>
      <Card>
        <RadioGroup value={type} onValueChange={setType} className="gap-1">
          {types.map((t) => <RadioGroup.Item key={t.value} value={t.value}>{t.label}</RadioGroup.Item>)}
        </RadioGroup>
      </Card>
      <TextField>
        <Label>Dónde o qué pasa (opcional)</Label>
        <Input value={comment} onChangeText={setComment} placeholder="Por ejemplo: Av. Bolívar a la altura de la redoma" />
      </TextField>
      <Button label="Enviar con mi ubicación" onPress={send} loading={busy} disabled={!type} />
    </ScrollView>
  );
}
