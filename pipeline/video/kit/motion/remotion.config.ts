import {Config} from '@remotion/cli/config';

/**
 * Entrega = ProRes 4444 com alfa de 16 bits, mudo, 1080x1920 @ 30.
 * O palco B depende do alfa, então o frame precisa sair em PNG antes de
 * virar vídeo — sem isso o Remotion compõe em YUV e o buraco do host aparece
 * preto em vez de transparente.
 */
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuva444p10le');
Config.setCodec('prores');
Config.setProResProfile('4444');
Config.setOverwriteOutput(true);
Config.setMuted(true); // a entrega é muda; o SFX é mapeado por sfx-cues.json
Config.setConcurrency(4);
Config.setChromiumOpenGlRenderer('angle');
