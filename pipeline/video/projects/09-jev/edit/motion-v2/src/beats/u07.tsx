import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Enter, driftAmbient, driftSupport, staggerStart, vertical} from '../kit/motion';
import {StageB} from '../kit/Stage';
import {CHIP, COL, MOTION} from '../kit/tokens';
import {Chip} from '../kit/ui';

/**
 * u07 — palco B, 36 f (1,20 s). A fala é "Então você lista as opções": o canvas
 * mostra a lista se formando, e a lista continua andando no frame do corte.
 *
 * O que este beat NÃO faz, de propósito:
 *
 * - Nenhum chip vira placa ink e nenhum recebe ouro. Aqui a fila é a lista, não
 *   a decisão: o vencedor é assunto do u08 e o u01 já gastou o gesto (financeiro
 *   a 94% assumindo a placa). Eleger "humano" herói neste frame contradiria os
 *   dois, e o spec pede a mesma coisa. A vez de cada chip vem do movimento: o
 *   que está chegando é o que se olha, e o último a chegar segura a atenção.
 * - O stagger é o de grupo com 4 irmãos (3 f), não os 7 f do spec. Sete frames
 *   entre irmãos deixam de ser um grupo e viram quatro eventos solos; num beat
 *   de 36 f isso empurra a última chegada para dentro do tail, e o beat fecha em
 *   silêncio. Com 3 f a fila é uma tacada só — o motor da referência.
 * - Sem caret, sem rótulo secundário, sem contagem de opções: o chip é a linha
 *   de decisão do kit, idêntica à do u01, e é isso que mantém o corte B→C→B sem
 *   deslocar o tipo. A ênfase vem do ritmo, não de cromo.
 *
 * O primeiro chip começa em -5 e no frame 0 já está em voo: palco B que abre com
 * o canvas vazio gasta o primeiro terço do beat mostrando nada, e o corte (seco)
 * tem de cair sobre movimento.
 */

const ENTRADA = -5;

/**
 * A fila mora na faixa útil do palco B (y 40..700) e longe da franja da caption
 * (700..960), que é do outro agente. Topo em 160 põe os quatro chips em
 * 160..586 em repouso, com o pior frame da entrada (último chip, +42 px) em 628:
 * dentro da faixa, e nunca perto da cabeça do host, que começa em y=780.
 */
const TOPO = 160;

const OPCOES = ['financeiro', 'suporte', 'urgente', 'humano'];

// o chip ocupa a coluna inteira (920 px): não tem para onde ir em x sem sair da
// faixa, então a deriva dele é só em y. A coluna que hospeda a fila anda menos
// (ambiente) que os chips (apoio) — é essa diferença de taxa que mantém o tail
// com duas velocidades em vez de um bloco rígido deslizando.
const ROTA_CHIP = vertical(driftSupport);
const ROTA_COLUNA = vertical(driftAmbient);

const Opcao: React.FC<{frame: number; duration: number; index: number; label: string}> = ({
  frame,
  duration,
  index,
  label,
}) => (
  <Enter
    frame={frame}
    duration={duration}
    start={staggerStart(index, ENTRADA, OPCOES.length)}
    enter={MOTION.enter}
    from={{y: MOTION.travel.chip, scale: 0.97, opacity: 0}}
    driftRate={ROTA_CHIP}
    fade={MOTION.fade}
    style={{
      position: 'absolute',
      left: COL.x,
      top: TOPO + index * (CHIP.h + CHIP.gap),
      width: CHIP.w,
    }}
  >
    <Chip label={label} />
  </Enter>
);

export const U07: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();

  return (
    <StageB>
      {/* camada ambiente: a coluna que hospeda a fila. Ela sobe devagar por baixo
          dos chips e é o que garante que a lista inteira continue viva depois que
          o último chip assenta — sem ela o tail seria um hold de 20 frames. */}
      <Enter frame={frame} duration={duration} start={ENTRADA} enter={1} driftRate={ROTA_COLUNA}>
        {OPCOES.map((label, i) => (
          <Opcao key={label} frame={frame} duration={duration} index={i} label={label} />
        ))}
      </Enter>
    </StageB>
  );
};
