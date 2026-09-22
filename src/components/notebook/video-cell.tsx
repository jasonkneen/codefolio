import { useState } from 'react';
import type { NotebookVideo } from '@/lib/notebook/videos';

export function VideoCell({ video }: { video?: NotebookVideo }) {
  const [failed, setFailed] = useState(false);
  if (!video) return <p className="folio-placeholder">Drop a video onto this notebook.</p>;
  return <figure className="folio-video-cell nodrag nopan nowheel">
    <video src={video.src} controls playsInline preload="metadata" aria-label={video.name || 'Video'} onError={() => setFailed(true)} />
    {failed && <p role="status">This browser cannot play this video. Try an MP4 or WebM with a supported codec.</p>}
    {(video.caption || video.name) && <figcaption>{video.caption || video.name}</figcaption>}
  </figure>;
}
