# Sistema de Áudio e Mídia

Este documento descreve a arquitetura do sistema de reprodução de áudio no TV Ads Player.

## 1. Arquitetura de Reprodução e Codecs
Diferente de aplicações desktop (como C++ ou Java) que necessitam embutir bibliotecas estáticas (como `FFmpeg` ou `LAME`) para decodificar arquivos de mídia, navegadores web modernos possuem mecanismos robustos de decodificação nativos a nível de Sistema Operacional (OS).

Utilizamos a **HTML5 Audio API** (e por baixo dos panos a **Web Audio API** do motor V8/Blink) para lidar com a decodificação de áudio. 
Isso traz vantagens substanciais:
- **Latência Mínima:** A decodificação ocorre em threads otimizadas do navegador com aceleração de hardware, evitando gargalos no event-loop do JavaScript.
- **Sem peso adicional:** Evitamos enviar pesados decodificadores WebAssembly para o cliente (o que aumentaria o carregamento inicial em vários Megabytes).
- **Formatos suportados nativamente:** MP3, WAV e MPEG (MP4 Audio).

## 2. Detecção e Validação Automática
Antes de um áudio ser salvo no Supabase Storage, o sistema de validação age no Front-End:
1. **MIME Type Checking:** A função `validateAudio` detecta a estrutura do arquivo. Tipos permitidos: `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`.
2. **Metadata e Corrupção:** Uma instância em memória (`new Audio()`) é gerada com o `Blob` do arquivo local. O evento `onloadedmetadata` valida se o áudio tem pelo menos 1 segundo. Caso o arquivo esteja corrompido, o navegador dispara o evento `onerror` imediatamente, rejeitando o upload.
3. **Limites:** O tamanho máximo é de `50MB` por faixa, preservando a estabilidade da rede.

## 3. Lógica de "Double Buffer" (Crossfade Mix)
Para eliminar os espaços de silêncio (gaps) que naturalmente ocorrem quando uma tag `<audio>` termina e outra começa a carregar, implementamos uma arquitetura "DJ".
* Existem **dois elementos de áudio invisíveis** instanciados.
* Enquanto o **Player A** está tocando a música, o **Player B** é alimentado com a próxima faixa da fila.
* Faltando `2.5 segundos` para o término da faixa do Player A, iniciamos o `fadeAudio` (um decaimento linear de volume) no Player A e um ganho progressivo de volume no Player B, que recebe o comando `play()`.
* Essa mecânica suporta variadas **taxas de amostragem** (Sample Rates de 44.1kHz a 48kHz, 16-bit ou 24-bit) lidando nativamente com o re-sampling do OS.

## 4. Testes e Estabilidade
Os testes do gerenciador de filas e intersecção de locuções encontram-se em `src/lib/utils.test.ts`. Eles são validados utilizando o framework de testes rápidos **Vitest**.

## 5. Interface de Gerenciamento (UI)
Na aba de "Trilha Sonora" e "Locuções", as faixas enviadas contam com um Preview Universal embutido. Utilizando a tag `<audio controls>`, é possível ouvir o que está cadastrado com total suporte a scrubbing e pause/play. As faixas ilegíveis no sistema da TV também exibirão log detalhado do erro caso algo não seja carregado no motor de playback local.