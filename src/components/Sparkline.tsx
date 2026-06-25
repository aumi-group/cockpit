'use client';
import { useMemo } from 'react';

export function Sparkline({ data, width = 120, height = 32, stroke = '#5ce1ff' }: {
  data: number[]; width?: number; height?: number; stroke?: string;
}) {
  const path = useMemo(() => {
    if (!data?.length) return '';
    const max = Math.max(...data, 1);
    const step = width / Math.max(data.length - 1, 1);
    return data
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${i * step},${height - (v / max) * height}`)
      .join(' ');
  }, [data, width, height]);
  if (!data?.length) return <svg width={width} height={height} />;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
