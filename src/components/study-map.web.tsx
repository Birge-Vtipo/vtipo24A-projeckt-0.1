import React from 'react';
import { Listing } from '../types';
import { MapPanel } from './map-panel';
export default function StudyMap({ items }: { items: Listing[] }) {
  return <MapPanel items={items} render={url => React.createElement('iframe', {
    title: 'StudySpot — OpenStreetMap', src: url,
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    referrerPolicy: 'strict-origin-when-cross-origin',
    style: { width: '100%', height: '100%', border: 0 },
  })} />;
}
