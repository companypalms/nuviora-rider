import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

// Uniwind solo les da className a los componentes de react-native: este hay que envolverlo. Sin esto, en el teléfono se
// ignoraba "flex-1", la pantalla quedaba sin alto y los textos se aplastaban a cero (en la vista web sí funcionaba).
export const SafeAreaView = withUniwind(SafeAreaContextView);
