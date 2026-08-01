import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { TabBar } from '@/components/tab-bar';
import { Palette } from '@/constants/theme';

// Onglets : Défis · Ranking · Accueil(centre) · Map · Profil (bas-droite, cf. retour fondateur).
// Icônes Material Symbols Rounded — contour au repos, rempli quand l'onglet est actif.
// Barre custom (bouton central en dôme) → cf. components/tab-bar.tsx.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Palette.whitePP },
      }}>
      <Tabs.Screen
        name="jouer"
        options={{
          title: 'Défis',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="bolt" color={color} size={size} fill={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="classement"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="leaderboard" color={color} size={size} fill={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="home" color={color} size={size} fill={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="explore" color={color} size={size} fill={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="person" color={color} size={size} fill={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
