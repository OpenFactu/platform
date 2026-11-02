import React, { useEffect, useRef } from 'react';

/** Un `<video>` que sigue a su stream (React no sabe poner `srcObject`). */
export const StreamVideo: React.FC<{
  stream: MediaStream | null | undefined;
  mirrored?: boolean;
  contain?: boolean;
}> = ({ stream, mirrored, contain }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream ?? null)) {
      ref.current.srcObject = stream ?? null;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${mirrored ? '-scale-x-100' : ''}`}
    />
  );
};

/** El audio de un participante: fuera de los recuadros, que van silenciados. */
export const StreamAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
};
