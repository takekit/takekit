import React from 'react';
import {PatternBeat} from '../patterns';
import type {BeatSpec} from '../spec';
import job from '../project/beats.json';

/** Stub de exemplo do kit — um beat real do vídeo é escrito com as skills. */
export const U01: React.FC = () => {
  const spec = (job.beats as BeatSpec[]).find((b) => b.id === 'u01');
  if (!spec) return null;
  return <PatternBeat spec={spec} />;
};
