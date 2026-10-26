import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Alert } from 'heroui-native/alert';
import { Button as HeroButton } from 'heroui-native/button';
import { Card as HeroCard } from 'heroui-native/card';
import { Spinner } from 'heroui-native/spinner';

// Las piezas de la app sobre HeroUI Native (decisión del usuario del 23/10: la app con HeroUI; la web sigue con MUI).
// Se importa cada componente por su ruta para no cargar la librería entera.

type Kind = 'primary' | 'secondary' | 'alarm' | 'ok';

/** Botón grande (ancho completo, tamaño lg): se toca con el pulgar en la calle. */
export function Button({ label, onPress, kind = 'primary', disabled, loading, className }: {
  label: string;
  onPress: () => void;
  kind?: Kind;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variant = ({ primary: 'primary', secondary: 'outline', alarm: 'secondary', ok: 'primary' } as const)[kind];
  const surface = kind === 'ok' ? 'bg-success' : kind === 'alarm' ? 'bg-white' : '';
  const text = kind === 'ok' ? 'text-success-foreground' : kind === 'alarm' ? 'text-danger' : '';
  return (
    <HeroButton variant={variant} size="lg" onPress={onPress} isDisabled={disabled || loading} className={`w-full ${surface} ${className ?? ''}`}>
      {loading ? <Spinner size="sm" /> : <HeroButton.Label className={`font-bold ${text}`}>{label}</HeroButton.Label>}
    </HeroButton>
  );
}

export function Card({ title, children, tone }: { title?: string; children: ReactNode; tone?: 'accent' }) {
  return (
    <HeroCard variant={tone ? 'secondary' : 'default'} className={tone === 'accent' ? 'bg-accent-soft' : undefined}>
      <HeroCard.Body className="gap-3">
        {title ? <HeroCard.Title className="text-xs font-bold uppercase tracking-wider text-muted">{title}</HeroCard.Title> : null}
        {children}
      </HeroCard.Body>
    </HeroCard>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="gap-0.5">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'error' | 'ok' }) {
  const status = ({ warn: 'warning', error: 'danger', ok: 'success' } as const)[tone];
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{text}</Alert.Title>
      </Alert.Content>
    </Alert>
  );
}
