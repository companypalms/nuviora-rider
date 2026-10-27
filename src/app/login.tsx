import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from '@/components/safe-area-view';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { TextField } from 'heroui-native/text-field';
import { Button, Notice } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Unauthorized' ? e.message : 'Correo o contraseña incorrectos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="w-full max-w-md flex-1 justify-center gap-3 self-center p-6">
        <View className="mb-3 flex-row items-center gap-2.5">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent">
            <Text className="text-xl font-extrabold text-accent-foreground">N</Text>
          </View>
          <Text className="text-lg font-bold text-foreground">Nuviora Rider</Text>
        </View>
        <Text className="text-3xl font-extrabold text-foreground">Entra con tu usuario</Text>
        <Text className="text-base text-muted">El mismo correo y contraseña que te dio administración.</Text>
        <View className="mt-3 gap-3">
          <TextField isRequired>
            <Label>Correo</Label>
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="tu@correo.com" />
          </TextField>
          <TextField isRequired>
            <Label>Contraseña</Label>
            <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} placeholder="Tu contraseña" />
          </TextField>
          {error ? <Notice text={error} tone="error" /> : null}
          <Button label="Entrar" onPress={submit} loading={busy} disabled={!email || !password} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
