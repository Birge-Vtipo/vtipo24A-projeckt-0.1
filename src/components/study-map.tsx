import React from 'react';
import { WebView } from 'react-native-webview';
import { Listing } from '../types';
import { MapPanel } from './map-panel';
import { Notice } from './ui';
export default function StudyMap({ items }: { items: Listing[] }) {
  return <MapPanel items={items} render={url => <WebView
    source={{ uri: url }} applicationNameForUserAgent="Birge/1.0"
    originWhitelist={['https://www.openstreetmap.org']}
    renderError={() => <Notice error>Карта жүктелмеді / Карта не загрузилась</Notice>}
  />} />;
}
