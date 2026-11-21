import { Suspense, lazy, useState } from 'react';
import Figure, { type FigureProps } from './Figure';
import type { CameraView } from './Figure3D';
import { useStore } from '../lib/store';
import { fighterById } from '../data/fighters';

const Figure3D = lazy(() => import('./Figure3D'));

export interface FigureViewProps extends FigureProps {
  /** Override the user's 2D/3D setting. */
  mode?: '2d' | '3d';
  view?: CameraView;
  interactive?: boolean;
}

/** Renders the fighter in 2D or 3D according to the user's setting, falling back to 2D. */
export default function FigureView({ mode, view, interactive, ...props }: FigureViewProps) {
  const { data } = useStore();
  const [unsupported, setUnsupported] = useState(false);
  const use3d = (mode ?? data.settings.figure) === '3d' && !unsupported;
  const look = props.look ?? fighterById(data.settings.fighter);

  if (!use3d) return <Figure {...props} look={look} />;
  return (
    <Suspense fallback={<Figure {...props} look={look} />}>
      <Figure3D {...props} look={look} view={view} interactive={interactive} onUnsupported={() => setUnsupported(true)} />
    </Suspense>
  );
}
