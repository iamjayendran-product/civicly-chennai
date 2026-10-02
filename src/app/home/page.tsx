import { Suspense } from 'react';
import { MapView } from '@/components/map/MapView';

export default function HomePage() {
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}
