# Takekit — Product Spec

Documento vivo das decisões de produto alinhadas em 2026-09-23.

## 1. Visão

Takekit é um **editor de vídeo AI-first**: a IA faz **80–100%** da edição. O humano direciona por chat (briefing, estilo, correções), não opera a NLE como trabalho principal.

Pitch: *AI-first video editing harness — múltiplos projetos de vídeo em paralelo, orquestrados por chat.*

## 2. Unidade de trabalho: projeto de vídeo

A unidade não é “um arquivo de vídeo”. É um **projeto de vídeo**, que carrega:

- Briefing
- Estilo (preset / config portátil)
- Mídia (fala, B-roll, assets)
- Status das etapas do pipeline
- Preview / export

Cada thread do harness aponta para um projeto.

## 3. Harness (tipo Codex App)

- **N threads**, cada uma = um projeto de vídeo
- Um **agente** orquestra etapas em **paralelo** entre projetos
- O operador conversa; o engine agenda trim, captions, matting, motion, etc.

## 4. Duas views

| View | Papel |
|------|--------|
| **Compacta** | Só chat. **Produto principal.** |
| **Detalhada** | Timeline para **ver / dar play** (não editar frame a frame). Upsell / power users. |

## 5. Layout

- **Centro:** chat
- **Esquerda:** lista de threads (projetos)
- **Direita:** sidebar com **toggle** para a timeline (view detalhada)

## 6. Pipeline headless

Feito (23/09/2026): trim com **FFmpeg** + `tighten_cuts` (RMS), matte do palco B com **Robust Video
Matting**, captura de frame, preview e export com FFmpeg; captions (PIL+ffmpeg), SFX prep, Remotion
motion e loudnorm no mesmo fluxo. Estilo vira **config** em `/styles`. Detalhes em
[pipeline headless](../pipeline/video/headless/README.md).

## 7. Estilo como ativo portátil

Estilo não vive dentro do projeto de edição. É um **ativo versionável** (pasta `/styles`, ex. `09-jev`): LUT, preset, template, regras de palco/caption. Projetos **referenciam** o estilo; dá pra trocar sem reescrever o engine.

## 8. Público

**Creator solo** — quem produz Reels/Shorts sozinho e precisa de throughput (vários projetos ao mesmo tempo), não de uma suíte de equipe.

## 9. Formatos futuros (não no MVP)

- SaaS
- Template + agente (pacote de estilo + fluxo)
- White-label

## 10. Próximos passos

1. Prototipar a **view compacta** (chat + threads)
2. ~~Pipeline headless~~ (feito em 23/09/2026)
3. Testar **2 vídeos em paralelo** no harness

## Mapa de pastas (scaffold)

```
takekit/
├── apps/        # Views compacta e detalhada
├── engine/      # Orquestrador de projetos / threads
├── pipeline/    # Etapas headless
├── styles/      # Presets portáteis (ex.: 09-jev)
└── docs/        # Specs e decisões
```

## Fora de escopo (por agora)

- Pixel / clientes de marketing
- Conteúdo curto (roteiro) como produto próprio — entra como *input* do projeto, não como bot separado neste repo
- Checkout / pricing (ainda sem catálogo fechado)

---

*Não é opinião jurídica de marca. Spec de produto.*
