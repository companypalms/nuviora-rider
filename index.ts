// Entrada de la app: primero las tareas de segundo plano (alarma y GPS), que Android puede correr con la app cerrada;
// después Expo Router con las pantallas.
import './src/background';
import 'expo-router/entry';
