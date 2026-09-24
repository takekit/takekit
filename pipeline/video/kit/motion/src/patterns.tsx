/** Atalhos opcionais quando o objeto da cláusula já é este (lista com %, logo, timer…).
 *  Não são cenas obrigatórias. O default é skill + <StageB>/<StageC>. */
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {curve, fadeIn, progress, sweep} from './kit/curve';
import {sans} from './kit/fonts';
import {Enter, driftAmbient, driftHero, driftSupport, staggerStart, vertical} from './kit/motion';
import {StageB, StageC} from './kit/Stage';
import {CHIP, COL, MOTION, PALETTE, RADIUS, TYPE} from './kit/tokens';
import {
  Accent,
  Bar,
  BrandMark,
  type BrandId,
  BigNumber,
  Chip,
  Dot,
  Eyebrow,
  NumericSlots,
  Pill,
  Plate,
  Rule,
} from './kit/ui';
import type {BeatSpec, CardItem, ChipRow, ChoiceOpt} from './spec';

const ENTRADA = -5;

const Stage: React.FC<{palco: 'B' | 'C'; children: React.ReactNode}> = ({palco, children}) =>
  palco === 'B' ? <StageB>{children}</StageB> : <StageC>{children}</StageC>;

const Cab: React.FC<{frame: number; text?: string}> = ({frame, text}) => {
  if (!text) return null;
  const op = fadeIn(frame, ENTRADA, 12);
  return (
    <div style={{position: 'absolute', left: COL.x, top: 92, opacity: op, width: COL.w}}>
      <Eyebrow>{text}</Eyebrow>
    </div>
  );
};

/* ------------------------------------------------------------------ chips-decision */

const ChipsDecision: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const rows = (spec.inputs.rows as ChipRow[]) ?? [];
  const vence = Number(spec.inputs.lockAt ?? Math.max(12, duration - 17));
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      {rows.map((row, i) => {
        const inicio = staggerStart(i, ENTRADA, rows.length);
        const subida = progress(frame, {start: inicio, enter: row.winner ? 38 : 26, duration, ease: 'rise'});
        const pct = Math.min(row.pct, Math.round(row.pct * subida.s));
        const assume = row.winner ? fadeIn(frame, vence, 9) : 0;
        const drift = row.winner ? vertical(driftHero) : vertical(driftSupport);
        return (
          <Enter
            key={row.label}
            frame={frame}
            duration={duration}
            start={inicio}
            enter={MOTION.enter}
            from={{y: 42, scale: 0.97, opacity: 0}}
            driftRate={drift}
            fade={6}
            style={{
              position: 'absolute',
              left: COL.x,
              top: 204 + i * (CHIP.h + CHIP.gap),
              width: CHIP.w,
            }}
          >
            <Chip
              label={row.label}
              value={`${pct}%`}
              meter={(row.pct / 100) * subida.s}
              tone={row.winner && assume >= 1 ? 'block' : 'outline'}
              overlay={row.winner ? assume : 0}
            />
          </Enter>
        );
      })}
    </Stage>
  );
};

/* ------------------------------------------------------------------ binary-bar */

const BinaryBar: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const yes = String(spec.inputs.yes ?? 'SIM');
  const no = String(spec.inputs.no ?? 'NÃO');
  const pct = Number(spec.inputs.pct ?? 94) / 100;
  const fill = progress(frame, {start: 5, enter: duration - 14, duration, ease: 'rise'}).s * pct;
  return (
    <Stage palco={spec.palco}>
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: 32, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: 498, width: COL.w, height: 236}}
      >
        <Plate tone="block" radius={RADIUS.plate} style={{width: '100%', height: '100%'}}>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.heroLabel,
              color: PALETTE.cream,
              padding: '36px 40px 0',
            }}
          >
            {yes}
          </div>
          <Bar pct={fill} w={COL.w - 80} h={22} radius={4} onInk style={{position: 'absolute', left: 40, bottom: 28}} />
        </Plate>
      </Enter>
      <Enter
        frame={frame}
        duration={duration}
        start={staggerStart(1, ENTRADA, 2)}
        enter={MOTION.enterPlate}
        from={{y: 32, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftSupport)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: 498 + 236 + 72, width: COL.w, height: 176}}
      >
        <Plate tone="outline" radius={RADIUS.plate} style={{width: '100%', height: '100%'}}>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.cardTitle,
              color: PALETTE.muted,
              padding: '32px 40px 0',
            }}
          >
            {no}
          </div>
          <Bar pct={0.08} w={COL.w - 80} h={16} radius={4} style={{position: 'absolute', left: 40, bottom: 28}} />
        </Plate>
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ logo-shine */

const LogoShine: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const brand = (spec.inputs.brand as BrandId) ?? 'jev';
  const size = Number(spec.inputs.size ?? 380);
  const shineAt = Number(spec.inputs.shineAt ?? 4);
  const shine = sweep(frame, shineAt, MOTION.shine);
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{y: 30, scale: 0.92, opacity: 0}}
        driftRate={driftHero}
        fade={MOTION.fadePlate}
        style={{
          position: 'absolute',
          left: COL.cx - size / 2,
          top: 220,
          width: size,
          height: size,
        }}
      >
        <Plate
          tone="block"
          radius={size / 2}
          style={{width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center'}}
        >
          <BrandMark brand={brand} box={size * 0.62} tone={PALETTE.cream} shine={shine} />
        </Plate>
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ chips-list */

const ChipsList: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const items = (spec.inputs.items as string[]) ?? [];
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      {items.map((label, i) => {
        const inicio = staggerStart(i, ENTRADA, items.length);
        return (
          <Enter
            key={label}
            frame={frame}
            duration={duration}
            start={inicio}
            enter={MOTION.enter}
            from={{y: 42, scale: 0.97, opacity: 0}}
            driftRate={vertical(driftSupport)}
            fade={6}
            style={{
              position: 'absolute',
              left: COL.x,
              top: 160 + i * (CHIP.h + CHIP.gap),
              width: CHIP.w,
            }}
          >
            <Chip label={label} />
          </Enter>
        );
      })}
    </Stage>
  );
};

/* ------------------------------------------------------------------ winner-pct */

const WinnerPct: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const label = String(spec.inputs.label ?? '');
  const alvo = Number(spec.inputs.pct ?? 94);
  const lockAt = Number(spec.inputs.lockAt ?? Math.max(12, duration - 13));
  const subida = progress(frame, {start: 12, enter: lockAt - 12, duration, ease: 'rise'});
  const valor = Math.min(alvo, Math.round(alvo * subida.s));
  const trava = fadeIn(frame, lockAt, MOTION.micro);
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: 32, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: 360, width: COL.w, height: 440}}
      >
        <Plate tone="block" radius={RADIUS.plate} style={{width: '100%', height: '100%'}}>
          <div style={{padding: '48px 48px 0'}}>
            <div
              style={{
                fontFamily: sans,
                fontWeight: 800,
                fontSize: TYPE.cardTitle,
                color: PALETTE.cream,
                marginBottom: 24,
              }}
            >
              {label}
            </div>
            <NumericSlots
              text={`${valor}`}
              size={TYPE.heroNumber}
              color={PALETTE.gold}
              edge="center"
              style={{transform: `scale(${1 + 0.02 * trava})`}}
            />
          </div>
          <Bar pct={(alvo / 100) * subida.s} w={COL.w} h={20} onInk style={{position: 'absolute', left: 0, bottom: 0}} />
        </Plate>
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ card-list */

const CardList: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const items = (spec.inputs.items as CardItem[]) ?? [];
  const tagged = Number(spec.inputs.taggedIndex ?? 0);
  const tag = String(spec.inputs.tag ?? '');
  const classifica = Number(spec.inputs.tagAt ?? 16);
  const taggedNow = fadeIn(frame, classifica, 8);
  return (
    <Stage palco={spec.palco}>
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: 32, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: 176, width: COL.w, height: 320}}
      >
        <Plate tone="sheet" radius={RADIUS.card} style={{width: '100%', height: '100%', padding: '30px 36px'}}>
          <Eyebrow>{spec.eyebrow ?? ''}</Eyebrow>
          {items.map((it, i) => {
            const inicio = staggerStart(i, 0, items.length);
            const op = fadeIn(frame, inicio, 8);
            const hit = i === tagged ? taggedNow : 0;
            return (
              <div
                key={it.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginTop: 18,
                  opacity: op * (i === tagged ? 1 : 1 - 0.4 * taggedNow),
                }}
              >
                <Dot size={40} tone={hit > 0.5 ? 'gold' : 'outline'} label={it.letter ?? it.label[0]} />
                <div
                  style={{
                    flex: 1,
                    fontFamily: sans,
                    fontWeight: 800,
                    fontSize: TYPE.chipLabel,
                    color: PALETTE.ink,
                  }}
                >
                  {it.label}
                </div>
                {i === tagged && tag ? <Pill tone={hit > 0.5 ? 'gold' : 'outline'}>{tag}</Pill> : null}
              </div>
            );
          })}
        </Plate>
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ card-stamp */

const CardStamp: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const title = String(spec.inputs.title ?? '');
  const claim = String(spec.inputs.claim ?? '');
  const stamp = String(spec.inputs.stamp ?? 'RECUSADO');
  const strikeAt = Number(spec.inputs.strikeAt ?? Math.max(12, duration - 24));
  const stampAt = Number(spec.inputs.stampAt ?? strikeAt + 9);
  const risco = fadeIn(frame, strikeAt, 6);
  const carimbo = fadeIn(frame, stampAt, 6);
  return (
    <Stage palco={spec.palco}>
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterPlate}
        from={{y: 32, scale: 0.97, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={MOTION.fadePlate}
        style={{position: 'absolute', left: COL.x, top: 176, width: COL.w, height: 360}}
      >
        <Plate tone="sheet" radius={RADIUS.card} style={{width: '100%', height: '100%', padding: '36px 40px'}}>
          <Eyebrow>{spec.eyebrow ?? ''}</Eyebrow>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.cardTitle,
              color: PALETTE.ink,
              marginTop: 18,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 800,
              fontSize: TYPE.chipLabel,
              color: PALETTE.muted,
              marginTop: 16,
              textDecoration: risco > 0.5 ? 'line-through' : 'none',
            }}
          >
            {claim}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 48,
              bottom: 48,
              opacity: carimbo,
              transform: `rotate(-12deg) scale(${0.86 + 0.14 * carimbo})`,
            }}
          >
            <Pill tone="ink">{stamp}</Pill>
          </div>
        </Plate>
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ chips-choice */

const ChipsChoice: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const options = (spec.inputs.options as ChoiceOpt[]) ?? [];
  const chosen = String(spec.inputs.chosen ?? '');
  const escolha = Number(spec.inputs.chooseAt ?? 28);
  const tileW = 272;
  const gap = (COL.w - options.length * tileW) / Math.max(1, options.length - 1);
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      {options.map((opt, i) => {
        const inicio = staggerStart(i, ENTRADA, options.length);
        const win = opt.id === chosen ? fadeIn(frame, escolha, 9) : 0;
        const lose = opt.id !== chosen ? fadeIn(frame, escolha, 9) : 0;
        return (
          <Enter
            key={opt.id}
            frame={frame}
            duration={duration}
            start={inicio}
            enter={MOTION.enterPlate}
            from={{y: 32, scale: 0.96, opacity: 0}}
            driftRate={opt.id === chosen ? driftHero : driftSupport}
            fade={MOTION.fadePlate}
            style={{
              position: 'absolute',
              left: COL.x + i * (tileW + gap),
              top: 190,
              width: tileW,
              height: 300,
              opacity: 1 - 0.35 * lose,
            }}
          >
            <Plate
              tone={win >= 0.5 ? 'block' : 'outline'}
              radius={RADIUS.card}
              style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 36}}
            >
              <BrandMark
                brand={(opt.id as BrandId) ?? 'chatgpt'}
                box={120}
                tone={win >= 0.5 ? PALETTE.cream : PALETTE.ink}
              />
              <div
                style={{
                  fontFamily: sans,
                  fontWeight: 800,
                  fontSize: TYPE.logoCaption,
                  color: win >= 0.5 ? PALETTE.gold : PALETTE.muted,
                  marginTop: 24,
                  letterSpacing: 2,
                }}
              >
                {opt.name}
              </div>
            </Plate>
          </Enter>
        );
      })}
    </Stage>
  );
};

/* ------------------------------------------------------------------ hero-range */

const HeroRange: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const from = String(spec.inputs.from ?? '5');
  const to = String(spec.inputs.to ?? '18');
  const unit = String(spec.inputs.unit ?? '×');
  const accent = spec.inputs.accent ? String(spec.inputs.accent) : undefined;
  const brand = spec.inputs.brand as BrandId | undefined;
  const a = fadeIn(frame, ENTRADA, 16);
  const b = fadeIn(frame, 20, 16);
  const x = fadeIn(frame, 46, 12);
  const regra = fadeIn(frame, 62, 14);
  const acc = accent ? fadeIn(frame, 126, 12) : 0;
  return (
    <Stage palco={spec.palco}>
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{y: 30, scale: 0.94, opacity: 0}}
        driftRate={driftHero}
        fade={8}
        style={{position: 'absolute', left: 0, top: 430, width: 1080, height: 320}}
      >
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 18, opacity: a}}>
          <BigNumber size={228}>{from}</BigNumber>
          <div style={{opacity: b, display: 'flex', alignItems: 'baseline', gap: 18}}>
            <span style={{fontFamily: sans, fontSize: 72, color: PALETTE.gold, fontWeight: 800}}>—</span>
            <BigNumber size={282}>{to}</BigNumber>
            <span
              style={{
                fontFamily: sans,
                fontWeight: 800,
                fontSize: 148,
                color: PALETTE.ink,
                opacity: x,
              }}
            >
              {unit}
            </span>
          </div>
        </div>
        <Rule w={720} t={6} color={PALETTE.gold} draw={regra} style={{margin: '18px auto 0'}} />
        {accent ? (
          <div style={{textAlign: 'center', marginTop: 28, opacity: acc}}>
            <Accent>{accent}</Accent>
          </div>
        ) : null}
        {brand ? (
          <div style={{display: 'flex', justifyContent: 'center', marginTop: 24, opacity: fadeIn(frame, 70, 12)}}>
            <BrandMark brand={brand} box={72} />
          </div>
        ) : null}
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ timer */

const Timer: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: duration} = useVideoConfig();
  const from = Number(spec.inputs.from ?? 1);
  const to = Number(spec.inputs.to ?? 0.5);
  const lockAt = Number(spec.inputs.lockAt ?? Math.max(8, duration - 9));
  const val = curve([
    [0, from],
    [lockAt, to],
  ])(Math.min(frame, lockAt));
  const lido = Math.round(val * 100) / 100;
  const texto = lido.toFixed(2).replace('.', ',');
  const frac = (lido - to) / Math.max(0.0001, from - to);
  return (
    <Stage palco={spec.palco}>
      <Cab frame={frame} text={spec.eyebrow} />
      <Enter
        frame={frame}
        duration={duration}
        start={ENTRADA}
        enter={MOTION.enterHero}
        from={{y: 30, scale: 0.94, opacity: 0}}
        driftRate={vertical(driftHero)}
        fade={8}
        style={{position: 'absolute', left: COL.x, top: 176, width: COL.w}}
      >
        <NumericSlots text={texto} size={TYPE.heroNumber} color={PALETTE.ink} edge="center" />
      </Enter>
      <Enter
        frame={frame}
        duration={duration}
        start={2}
        enter={MOTION.enterPlate}
        from={{y: 24, opacity: 0}}
        driftRate={vertical(driftAmbient)}
        fade={6}
        style={{position: 'absolute', left: COL.x, top: 496, width: COL.w}}
      >
        <Bar pct={frac} w={COL.w} h={16} radius={4} />
      </Enter>
    </Stage>
  );
};

/* ------------------------------------------------------------------ switch */

const MAP: Record<string, React.FC<{spec: BeatSpec}>> = {
  'chips-decision': ChipsDecision,
  'binary-bar': BinaryBar,
  'logo-shine': LogoShine,
  'chips-list': ChipsList,
  'winner-pct': WinnerPct,
  'card-list': CardList,
  'card-stamp': CardStamp,
  'chips-choice': ChipsChoice,
  'hero-range': HeroRange,
  timer: Timer,
};

export const PatternBeat: React.FC<{spec: BeatSpec}> = ({spec}) => {
  const Comp = MAP[spec.pattern];
  if (!Comp) {
    throw new Error(`padrão desconhecido: ${spec.pattern}`);
  }
  return <Comp spec={spec} />;
};
