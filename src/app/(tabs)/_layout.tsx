import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Fonts, Palette } from '@/constants/theme';

// Structure design « Ping Pang Connect » : Défis · Ranking · Accueil(centre) · Map · Train
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.evergreen,
        tabBarInactiveTintColor: Palette.grey,
        tabBarStyle: {
          backgroundColor: Palette.whitePP,
          borderTopColor: Palette.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontFamily: Fonts.bodySemibold, fontSize: 11 },
        sceneStyle: { backgroundColor: Palette.whitePP },
      }}>
      <Tabs.Screen
        name="jouer"
        options={{
          title: 'Défis',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="classement"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: 'Train',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
