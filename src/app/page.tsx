import { Suspense } from 'react';
import { MapView } from '@/components/map/MapView';

export default function Home() {
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}
