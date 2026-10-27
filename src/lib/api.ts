import { getItem, SESSION_KEY } from './storage';

// La API de Nuviora para el rider (/api/rider/* y las de la orden que ya existen). La dirección sale de
// EXPO_PUBLIC_API_URL; sin ella, la de producción.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.nuviora.cloud/api').replace(/\/$/, '');

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
}

/** Las tareas en segundo plano arrancan sin pasar por el inicio de sesión: toman el token guardado. Sin sesión, false. */
export async function restoreToken(): Promise<boolean> {
  if (token) {
    return true;
  }
  try {
    const raw = await getItem(SESSION_KEY);
    token = raw ? (JSON.parse(raw) as { token?: string }).token ?? null : null;
  } catch {
    token = null;
  }
  return token !== null;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: options.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError('Sin conexión con Nuviora. Revisa tus datos o el wifi.', 0, null);
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    onUnauthorized?.();
  }
  if (!response.ok) {
    const message = (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
      ? data.message
      : `Nuviora respondió ${response.status}.`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

// Lo que devuelve la API (solo lo que usa la app)
export type Offer = {
  id: number;
  round: number;
  expires_at: string;
  seconds_left: number;
  message: string;
  // §14.2: reemplazo de un rider que tuvo una incidencia (recoge el paquete donde está él)
  replacement?: boolean;
  center: { name: string | null; address: string | null };
};

export type Assignment = {
  logistics_order_id: number;
  status: string;
  status_label: string;
  next_action: string | null;
  center: { name: string | null; address: string | null; latitude: number | null; longitude: number | null; maps_url: string | null };
  order: { id: number; name: string; total: number; currency: string | null; payment_method: string | null; payments: { method: string; amount: number }[]; courier_shipment: boolean };
  // null en un retorno pendiente: ya no va al cliente (§16.1)
  client: { name: string; phone: string | null; address: string | null; location: string | null; latitude: number | null; longitude: number | null } | null;
  estimated_pay: number | null;
  open_novelty: { id: number; type: string; description: string | null; owner: string; opened_at: string; escalated_at: string | null } | null;
  // §14: el reemplazo recoge el paquete donde está el otro rider; su incidencia abierta, si la reportó él
  pickup: { name: string | null; phone: string | null; latitude: number | null; longitude: number | null } | null;
  open_incident: { id: number; type: string; type_label: string; status: string } | null;
  // §10, §22.3: la parada dentro de su ruta, la que sigue y, si falta entregar una anterior, cuál
  route: {
    id: number;
    stop: number;
    stops: number;
    next_logistics_order_id: number | null;
    waiting_for: { stop: number; order: string | null; logistics_order_id: number } | null;
  } | null;
};

export type Me = {
  rider: { id: number; names: string; surnames: string | null; phone: string | null };
  profile: { is_active: boolean; suspended_at: string | null; notifications_enabled: boolean | null; location_permission: string | null; last_location_at: string | null; push_error: string | null };
  center: { id: number; name: string; address: string | null; latitude: number | null; longitude: number | null; maps_url: string | null } | null;
  location: { every_seconds: number; every_meters: number };
  // §17, §22.4: el efectivo que tiene que entregar en el centro (los bolívares a la tasa de su orden, R6)
  cash: { usd: number; ves: number; total_usd: number; limit_usd: number | null; over_limit: boolean };
};
