import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { prepareImage } from '@/lib/notebook/images';
import { prepareVideo } from '@/lib/notebook/videos';
import { useFolioStore } from '@/lib/notebook/store';
import type { Cell } from '@/lib/notebook/types';
import { uid } from '@/lib/utils';

export function useMediaDrop(nodeId?: string, position?: (point: { x: number; y: number }) => { x: number; y: number }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const isFile = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  return {
    'data-media-drop': dragging ? 'active' : undefined,
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (!isFile(event)) return;
      event.preventDefault(); event.stopPropagation();
      depth.current++; setDragging(true);
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!isFile(event)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      event.stopPropagation();
      if (--depth.current <= 0) { depth.current = 0; setDragging(false); }
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!isFile(event)) return;
      depth.current = 0; setDragging(false);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files);
      const point = position?.({ x: event.clientX, y: event.clientY });
      if (files.length > 20 || files.reduce((sum, f) => sum + f.size, 0) > 32 * 1024 * 1024) {
        toast.error('Drop up to 20 files, totaling less than 32 MB.'); return;
      }
      void (async () => {
        const progress = toast.loading('Adding media…');
        const cells: Cell[] = [];
        try {
          for (const file of files) {
            try {
              const video = file.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov)$/i.test(file.name);
              const cell: Cell = { id: uid('cell'), kind: video ? 'video' : 'image', source: '', output: null, status: 'idle' };
              if (video) cell.video = await prepareVideo(file);
              else cell.image = await prepareImage(file);
              cells.push(cell);
            } catch (error) { toast.error(`${file.name}: ${error instanceof Error ? error.message : 'Could not add this file.'}`); }
          }
          if (cells.length) useFolioStore.getState().addMediaCells(cells, nodeId, point);
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add media.'); }
        finally { toast.dismiss(progress); }
      })();
    },
  };
}
