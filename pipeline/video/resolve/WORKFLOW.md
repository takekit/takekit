# Workflow de edição de vídeos curtos

Entender → storyboard interno → buscar material → montar a fala → compor → revisar e entregar.
YAP percorre o mesmo fluxo com menos recursos visuais. Documentação técnica entra por necessidade.

## 1. Entender e esclarecer

Ler pedido, briefing, estado atual e [estilo do creator](../estilo-creator.md). Identificar objetivo,
argumento, público, emoção e [formato](FORMATOS.md). Default do creator ativo: explicação ilustrada
/ palco-abc, fechado no 09-jev — estilo [Talking Head + Motions](../../../styles/talking-head-motions/prompt.md). A entrevista resolve só o que o default
não cobre; não reabre palco, caption, faixa nem SFX. Formato indefinido **não** vira YAP.

Autoridade: pedido explícito do usuário → decisões específicas do vídeo → preferências do creator
→ defaults do formato/recurso. Distinguir exigência do briefing de sugestão automática. Se uma
contradição relevante não for resolvida por essa precedência, perguntar antes da ação dependente.
Pedidos explícitos persistem entre sessões; não exigir reconfirmação por troca de agente.
Sem vai-e-volta: decisão já registrada (estilo, plano, briefing, galeria) não é reaberta por
dúvida do agente nem por troca de harness — só o usuário reabre, e só com intenção explícita.
O padrão de fala do §3 vale na ausência de exceção explícita do usuário; uma anotação automática
de “pausa dramática” em briefing antigo não é essa exceção.

Briefing informa conteúdo e restrições, estilo informa preferências, plano registra estado e
escolhas da edição. Não copiar regras do workflow para esses arquivos. Modelo de entrada:
[briefing-template.md](references/briefing-template.md). Roteiro aprovado e emendas explícitas
são a referência da fala; sugestões editoriais não autorizam reescrevê-lo.

## 2. Storyboard e material

Fazer internamente um plano por trecho/ideia: função (atrair, explicar, provar, conectar ou fechar),
visual pretendido, material necessário e motivo. Em `explicacao-ilustrada`, cada trecho escolhe
palco A/B/C e caption `seguir`/`segurar` conforme [FORMATOS.md](FORMATOS.md); registrar no
`storyboard` do plano. O objeto do canvas B/C é da cláusula, não um preset de cena. A-roll é
solução completa quando a expressão e fala sustentam a mensagem (palco A).
Registrar só decisões úteis no plano (§6). Vista HTML opcional via
`pipeline/storyboard_html.py` (não escrever na mão, não é gate). Sem aprovação de rotina.
Tempos iniciais são provisórios; reconciliar com a fala montada antes de compor.

### Gancho e busca

- Resolver título, primeira fala e primeiro visual como conjunto. Cena reconhecível pode representar
  a emoção/reação da frase; demonstração pode mostrar o resultado; print pode comprovar um fato.
  Uma referência viral inspira o mecanismo, sem garantir retenção ou justificar clipe desconectado.
- Para cada lacuna visual, buscar material que cumpra a função planejada. Preferir **vídeos do
  YouTube e vídeos, imagens e prints do X/Twitter**. Material do próprio creator, demonstração
  gravada, página oficial e outras fontes entram quando explicam ou comprovam melhor.
- Encontrar a coisa mencionada é ponto de partida. Inspecionar o trecho real: conteúdo, duração
  útil, qualidade, enquadramento vertical, legibilidade e relação com a fala. Thumbnail/título não
  comprovam adequação. Para provas, conferir autoria, data e contexto; recortes não podem alterar
  o sentido. Associação emocional não deve parecer registro factual do acontecimento narrado.
- Registrar material escolhido com URL/origem, arquivo local, trecho de origem, uso e som existente.
  Não salvar páginas de busca inteiras no contexto. Se a fonte estiver inacessível, usar outro
  recurso disponível e registrar a lacuna; não inventar conteúdo que não foi inspecionado.
- Se nenhum candidato funcionar, refinar storyboard ou usar fala direta. Não impor B-roll por
  menção, duração ou quota. YAP dispensa busca externa quando não houver necessidade visual.

## 3. Montagem da fala

### A. Seleção

1. Confrontar roteiro aprovado com gravação. Índice: Whisper word-level
   (`audio-16k` + timestamps); a transcrição nativa do DaVinci saiu com o Resolve.
   Timestamps de ASR **não são cortes finais** — a palavra chega com ar
   na cabeça. Depois de escolher as unidades, apertar cada range no waveform
   (`pipeline/tighten_cuts.py`, RMS). Só então montar a fala com `video/headless/trim.py`
   (FFmpeg) → `edit/aroll.mov`. Sem esse passo o
   clipe nasce com respiro interno, mesmo com gaps zero entre clipes.
2. Escolher a melhor execução de cada unidade, retirar tentativas concorrentes e falsos começos.
   Registrar fonte/in-out escolhidos e cobertura no plano; detalhar alternativas apenas quando
   houver decisão relevante ou dúvida. Conferir CTA, keyword, nomes, números e ressalvas.
3. Preservar ordem e fala aprovada, palavras completas e sincronismo. Não acrescentar, repetir,
   substituir ou omitir falas por iniciativa editorial. Caption e B-roll não corrigem fala ausente.
4. Se faltar fala, procurar outra tomada e conferir a fonte. Sem tomada válida, registrar trecho
   e pendência para o usuário; continuar trabalho independente. Emenda autorizada atualiza a
   referência do projeto, sem exigir nova confirmação do mesmo pedido.

### B. Cortes (FFmpeg, sem Resolve)

- Inspecionar `cuts.json`, `aroll.json` e `aroll.mov` atuais e preservar trabalho existente antes
  de refazer cortes. Footage original é imutável; experimentos numa cópia identificada do
  `cuts.json`. Não reconstruir edição atual por manifesto antigo.
- Padrão oficial para vídeos curtos: **fala dinâmica, sem sobras, esperas ou respiros entre falas**,
  inclusive dentro dos takes. Pausa intencional é exceção explícita do usuário. Preservar fonemas
  e articulação; não acelerar a voz por padrão nem impor cauda/tolerância fixa em milissegundos.
- Usar waveform ampliada, imagem e áudio para decidir bordas. Região plana pode ser fala baixa;
  pico pode ser ruído. Cortar ar/preparação até o ataque real da palavra e encerrar no fim do fonema.
  Ouvir palavras vizinhas à emenda; restaurar articulação se necessário, sem recolocar o respiro.
  Microfade corrige clique sem sobrepor sílabas. Remoção automática de silêncio é só primeira passagem.
- Borda se ajusta no `cuts.json` (frames, fim exclusivo) e a fala se remonta com `trim.py`: a
  montagem é determinística e refazer não acumula erro. Não repetir o que falhou sem mudar a hipótese.
- Após cada lote, conferir o relatório do `trim.py` (unidade → frames na fonte e na timeline),
  duração total e fps; reconciliar tempos de B-roll, captions e hosts. Zero gaps e sucesso do
  script não são aceite.

### C. Verificação da fala

Conferir cada unidade, todas as emendas e interior dos takes. Investigar fragmentos curtos e
possíveis duplicações; não eliminar fonemas por um limite fixo de duração. ASR full-file pode
fundir tentativas repetidas: isolar o trecho suspeito e conferir o áudio. Transcrição é apoio.

Reproduzir a sequência inteira a 1× com voz isolada, depois com imagem/mix; restaurar o mix.
Acionar Play não prova escuta: sem acesso efetivo ao áudio, registrar verificação pendente.
Registrar no plano timeline/versão, método, cobertura, emendas e divergências. Marcar a montagem
conferida apenas com roteiro, palavras, ritmo e sincronismo verificados; uma caixa marcada sem
observação não é evidência. Resolver a base antes de espalhar acabamento sobre falhas de fala.

## 4. Executar visual e som

Recursos em escada — parar no primeiro que resolve a função pedida:

1. **Galeria** ([GALLERY.md](presets/GALLERY.md), gerada do registro; `presets.py list`): recurso
   pronto e aprovado para aquela função.
2. **Scripts do repo** (`../headless/`, `engine/`, `pipeline/`, `motion/`): `trim`, `palco_b`,
   `compose`, `frame`, `tighten_cuts`, `caption_jobs` + `captions_palco`, `motion/scaffold` +
   `motion/render`, `map_sfx_cues`. Caminho já testado não se reescreve. Ver o [estilo](../../../styles/talking-head-motions/prompt.md).
3. **Camada nova no projeto**: última opção. Gerar a camada (`.mov` com alfa, PIL/FFmpeg/Remotion)
   ou o áudio que falta e entrar pelo `edit/compose.json`; validar num trecho curto antes de
   replicar. Acervos de terceiros ficam fora do processo. Resolve, MCP do Resolve e Fusion foram
   removidos em 23/09/2026 ([FUSION.md](FUSION.md) e [API-NOTES.md](API-NOTES.md) são legado).

Ler [BEHAVIORS.md](BEHAVIORS.md) para o comportamento dos recursos escolhidos. O agente decide
layout, hierarquia, foco, timing e combinações; presets são pontos de partida. Movimentos e
transições seguem o perfil definido na entrevista, modulados pelo formato e pelo contexto do trecho.

Canvas B/C em Remotion no kit ([motion/README.md](motion/README.md)): skills de motion, faixa
travada. Fora do canvas (host, câmera), camada própria em PIL/FFmpeg ou Remotion. Captions palco
pelo motor `captions_palco.py`. SFX pelos cues do beat (`pipeline/map_sfx_cues.py`).
YAP usa captions neutras e título durante todo o vídeo; não herda chroma/hero-word automaticamente.
[SCENES.md](SCENES.md) documenta apenas o helper opcional. `energetic`/`quiet` são defaults técnicos
desse helper, não formatos editoriais nem substitutos do perfil do creator.

Voz em primeiro plano. Escolher trecho útil e alinhar ataque do SFX ao gesto; não duplicar som do
asset nem adicionar pop por palavra. Conferir mix, pele, exposição, cor e continuidade; sem LUT
arbitrária. Níveis/presets são pontos de partida, medição e audição verificam a entrega.

## 5. Revisar e entregar

- **Editorial:** gancho compreensível, material relevante, hierarquia, leitura, ritmo, continuidade
  e som coerentes. Captions e título não disputam o rosto ou a prova. O formato acordado é reconhecível.
- **Técnica:** conferir grafo/inputs, início, acomodação, sustentação e saída; abrir capturas reais
  e assistir movimento com som. Medir desempenho no trecho quando um efeito custar demais.
  Capturar com `video/headless/frame.py` sobre o preview (`compose.py`, default `--quality preview`
  → `edit/preview.mp4`): o compositor é o mesmo do export, só a resolução e o encode mudam.
- Rever fala/sincronismo do §3C no resultado final. Um still não valida movimento, áudio ou cortes.
  Comparar os aspectos relevantes com a referência aprovada; mudança intencional não é regressão.
- O agente entrega o **preview** (720p, rápido). O export final é do creator: botão Exportar no
  Takekit, ou `video/headless/compose.py --quality final --from-preview` (mesmo spec do último
  preview), vertical 1080×1920@30 por padrão (`quality.json` do estilo), respeitando formato/fps
  acordados.
  Setup alternativo só com motivo: master 2160×3840 com footage 4K e pedido do cliente; 60 fps
  quando o material de origem (screen recording/animação) for a 60 fps.
  Contrato de entrega: H.264, 8–12 Mbps (vertical) / 16–20 Mbps (horizontal), AAC 256k; máster
  externo via ffmpeg `-c:v copy` quando necessário.
  Medir áudio final: referência atual −14 LUFS integrado e true peak ≤ −1 dBTP (o `compose.py`
  masteriza e imprime a medição). Sem nova aprovação obrigatória por adaptação.
- Entregar arquivo, spec (`edit/compose.resolved.json` ou `compose.json`) e pendências reais.
  Registrar aprovação estética por aspecto separadamente de teste técnico e portabilidade. Não
  declarar aprovado porque um script retornou sucesso.

## 6. Estado e aprendizado

Para uma edição nova, usar **um único `edit/plan.json`** como estado operacional; modelo:
[plan-template.json](references/plan-template.json). Preencher progressivamente com formato, perfil,
storyboard, seleção/material, timeline atual, verificações e pendências. Não pré-preencher resultados
como conferidos. O plano é interno, sem entrega/aprovação obrigatória. Resumo final deriva dele;
não exigir HANDOVER.md e review.md paralelos.

Planos antigos podem alimentar scripts próprios: preservar seus campos/contratos. Integrar o
estado existente sem sobrescrever dados nem migrar em massa. `compose.json`, jobs de captions e
`build.json`/`.comp` legados são artefatos de execução, não outro briefing. Reconciliar o
`aroll.json` atual antes de usar manifestos antigos.

Guardar decisões locais no projeto. Preferências gerais explícitas atualizam o perfil do creator.
Promover recurso à galeria quando tiver qualidade/utilidade reutilizável; registrar origem,
versão, dependências, preview e escopo de aprovação. Estado draft permite experimentar no escopo
pedido, sem inventar aprovação nem impor validação do usuário a toda escolha.

Antes de alterar execução compartilhada, preservar a anterior e comparar um trecho relevante.
Se a mudança regredir, corrigir ou manter a base anterior. Tutoriais e exemplos externos entram
sob demanda para resolver uma necessidade, sem crescer o contexto inicial a cada edição.
