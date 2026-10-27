import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, ActivityIndicator } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../src/store';
import { Shell } from '../src/components/shell';
function Layout() { const { darkMode } = useApp(); return <PaperProvider theme={darkMode ? MD3DarkTheme : MD3LightTheme}><StatusBar style={darkMode ? 'light' : 'dark'} /><Shell><React.Suspense fallback={<ActivityIndicator color="#216D5C" />}><Slot /></React.Suspense></Shell></PaperProvider>; }
export default function RootLayout() { return <SafeAreaProvider><AppProvider><Layout /></AppProvider></SafeAreaProvider>; }
