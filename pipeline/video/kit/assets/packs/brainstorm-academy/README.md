# Pack de edição de Reels — Brainstorm Academy

Importado em 15/09/2026 da pasta indicada pelo Oldaque. Autor: Mateus Ferreira / Brainstorm
Academy. Originais preservados em Downloads e copiados por categoria para esta biblioteca.

## O que está disponível

| Recursos | Local relativo a `video/kit/assets/` | Uso |
|---|---|---|
| 10 backgrounds | `backgrounds/brainstorm-academy/` | Mídia pronta para fundo de composição |
| 3 guias de margem | `guides/brainstorm-academy/` | Overlay temporário de inspeção de Reels, TikTok e Shorts |
| 15 sons em WAV 48 kHz estéreo | `sfx/brainstorm-academy/` | Catálogo existente, IDs com prefixo `brainstorm/` |
| Originais dos sons | `sfx/brainstorm-academy/originals/` | MP3/AAC preservados |
| 57 arquivos de fontes | `fonts/brainstorm-academy/` | Opções locais, sem instalação global ou mudança nas captions |
| 2 arquivos Premiere + 11 After Effects | `packs/brainstorm-academy/adobe/` | Referências originais Adobe; não convertidas |

[catalog.json](catalog.json) contém nomes originais, caminhos, checksums, metadados de mídia,
coleções identificadas e nomes dos presets Premiere. [transcript.txt](transcript.txt) preserva
a explicação fornecida pelo usuário. O registro de origem também está em `assets/ledger.json`.

## Fundos: escolher pela composição

**Preferência do Oldaque:** usar também fora do split screen, em cenas de tela inteira com uma
informação específica ou várias informações, vídeo, B-roll ou imagens. O fundo integra a cena
quando ajuda a organizar e apresentar o conteúdo; não é preenchimento obrigatório. O usuário
elogiou esse repertório e a possibilidade de escolher a cor de base do material transparente.

Para o `background-02-alpha.mov`, compor uma cor sólida por baixo do grid e colocar mídia/texto
por cima (compose ou canvas Remotion). A cor pode acompanhar o assunto, contraste e tratamento visual do
vídeo. A transparência permite trocar a base sem recolorir todo o material. Os demais fundos
opacos não oferecem essa mesma troca direta de cor por uma camada inferior.

Uma informação pode ganhar um painel principal; várias podem entrar juntas ou em sequência,
com hierarquia, espaçamento e tempo de leitura. Escolher escala e posições conforme o conteúdo,
preservando captions e zonas úteis. Não forçar divisão entre apresentador e mídia nem um layout
fixo para aproveitar os fundos. Avaliar o movimento do fundo para não disputar atenção com a
informação principal.

Todos têm 1080×1920 a 30 fps. Exceto o 09, duram 10 segundos.

| Arquivo | Aparência observada em frame a 2 s | Uso sugerido |
|---|---|---|
| `background-01.mp4` | Grid escuro | Material horizontal, gráficos ou demonstração |
| `background-02-alpha.mov` | Grid transparente, ProRes com alpha | Sobre cor sólida por baixo |
| `background-03.mp4` | Grid claro | Composição clara com texto contrastante |
| `background-04.mp4` | Textura de papel | Documento, anotação, colagem |
| `background-05.mp4` | Colagem de jornal | Contexto editorial; preservar leitura da prova |
| `background-06.mp4` | Luz azul/verde em fundo escuro | Fundo abstrato discreto |
| `background-07.mp4` | Luzes multicoloridas | Tratamento mais colorido quando fizer sentido |
| `background-08.mp4` | Folhagens e sombras | Atmosfera orgânica |
| `background-09.mp4` | Textura/luz roxa | Dura **7,1 s e contém áudio**; importar só vídeo se usado como fundo |
| `background-10.mp4` | Grid em perspectiva | Profundidade em composição |

Miniaturas em `previews/`; a descrição não comprova movimento nem loop perfeito. Escolher trecho
e conferir em playback. Para estender, verificar a emenda antes de repetir.
Esses fundos são assets prontos do pack; usá-los não substitui os motions do canvas.

## Sons: selecionar e sincronizar

Os WAV foram decodificados para PCM 24-bit, 48 kHz estéreo, sem normalização de volume. O catálogo
marca `normalized: false`; usar `engine/sfx_prep.py` para ganho relativo à voz após selecionar o
trecho. Nenhum som novo substitui automaticamente whoosh, notificação ou outros padrões aprovados.

- `brainstorm/riser-collection-15`: coleção de cerca de 60 s; marcar entrada e saída de um riser.
- `brainstorm/camera-shutter-click-5`: coleção indicada pelo nome; selecionar um disparo.
- Teclado, mouse, dinheiro e relógio: candidatos a foley quando a ação justificar.
- Boing, Among Us, Fahhh, Shocked e TikTok Core: candidatos a pontuação de humor/contexto.
- Pop, piano, gong e impact: pontuação conforme o peso da cena; não aplicar pop a cada palavra.

Categorias do catálogo são uma triagem pelo nome/contexto, não resultado de audição criativa.
Ouvir os arquivos antes de escolher. Sons longos podem conter várias ocorrências ou pausas;
não assumir que todo arquivo é um evento único. Sincronizar o gesto audível, não só o início do
arquivo. O helper de ganho recorta a partir do início; um trecho interno precisa primeiro ser
extraído como derivado do projeto.

## Guias e fontes

Guias: PNG 1080×1920 com alpha. Colocar numa track superior identificada como guia, na duração
necessária à inspeção; ajustar opacidade para enxergar a composição sob a referência.
Desabilitar antes da exportação e conferir a ausência no arquivo final.
As zonas representam a interface mostrada no pack, não uma garantia de todas as interfaces atuais.

Fontes: arquivos opcionais arquivados localmente. Usar só quando o design pedir; não trocar as fontes ou o motor das captions aprovadas. Não foi encontrado termo individual
de licença no pack; o catálogo preserva apenas a declaração de gratuidade da transcrição, sem
atribuir licença de redistribuição a fontes ou sons de terceiros.

## Presets Adobe: repertório para adaptar quando necessário

Os originais são `.prfpset`, `.mogrt` e `.ffx`, arquivados como referência; não foram convertidos.

| Referência do pack | Possível aplicação futura no nosso workflow |
|---|---|
| Fast zoom in/out | Comparar com nosso punch existente; preservar zoom + SFX e ancoragem |
| Pan contínuo e zoom contínuo | Módulo `camera` (zoom in/out) ou curva do kit de motion, com tempo relativo à duração do clipe |
| Bordas arredondadas | Máscara arredondada na mídia, ajustável à composição |
| Glitch, opacidade, escala, blur, stretch e entrada por palavra/letra | Referências para texto gráfico nativo; captions permanecem como estão |
| Preto e branco, stop motion, distorção | Tratamentos expressivos opcionais, quando a narrativa pedir |
| Voz de rádio e voz impactante | Referências de tratamento pontual no áudio; preservar a voz principal |

As correspondências são propostas de adaptação, não conversões prontas nem equivalência visual
comprovada. Seguir o plano de evolução: adaptar o que uma edição realmente precisar, revisar e
registrar o aprendizado. Biblioteca disponível não implica efeito obrigatório.

## Estado de validação

- 98 originais copiados com verificação SHA-256.
- Metadados de 10 vídeos, 15 sons e 3 guias consultados; 15 sons convertidos para WAV.
- Os 10 vídeos e os 15 WAV passaram por decodificação integral com ffmpeg sem erro.
- Fundos inspecionados em frames extraídos; ainda sem avaliação de movimento em playback.
- Sem instalação de fontes, alterações de captions ou edição de timelines.
- Aprovação estética, audição dos novos SFX e teste no pipeline pendentes de uso.
