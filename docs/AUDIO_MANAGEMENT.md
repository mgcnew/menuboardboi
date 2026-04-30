# Documentação Técnica: Sistema de Gerenciamento de Áudio (Mixer)

## 1. Visão Geral da Arquitetura
O sistema de gerenciamento de áudio (`useAudioMixer`) foi reprojetado para resolver o problema de sobreposição entre música de fundo e locução, implementando um mecanismo robusto de **Audio Ducking**. A solução utiliza dois elementos independentes de `HTMLAudioElement` controlados de forma centralizada pelo React, garantindo que as mídias possam ser executadas em paralelo com mixagem e transições suaves.

### 1.1 Principais Componentes
- **`musicPlayerRef`**: Elemento dedicado exclusivamente para tocar a fila de músicas de fundo. Opera em _loop_ contínuo e sequencial.
- **`voicePlayerRef`**: Elemento dedicado para locuções. É instanciado sob demanda para evitar alocação desnecessária de recursos.
- **`fadeVolume`**: Função utilitária fora do escopo do React que implementa uma interpolação linear (Fade In / Fade Out) do volume em intervalos de 50ms, independente do _event loop_ principal da UI.

## 2. Lógica de Sincronização e Timing
O requisito central estabelece que a locução inicie **exatamente** após 120 segundos (2 minutos) de reprodução contínua de música.
Para garantir precisão milimétrica e resiliência a interrupções (como pausas, buffer ou erros de carregamento de áudio):

1. **Timer Condicional**: Utilizamos um `setInterval` nativo rodando a 100ms que incrementa a variável de controle `musicPlaybackTimeMsRef`.
2. **Tempo Efetivo de Reprodução**: O timer _apenas_ incrementa se a propriedade `isMusicPlayingRef` for verdadeira e a locução não estiver ativa. Ou seja, se a música pausar ou falhar, o relógio também pausa.
3. **Disparo Preciso**: Assim que o relógio atinge `120 * 1000` milissegundos de _active play_, o sistema aciona a locução correspondente.

## 3. Mecanismo de Ducking e Transição de Volume
O processo ocorre em três etapas fundamentais:
- **Fade Out (Ducking)**: Imediatamente antes do play da locução, a música sofre redução (Ducking) para `10%` do seu volume original, levando `0.5s` a `1.0s` (configurável em `duckingFadeOutTime`).
- **Reprodução da Locução**: A locução é tocada sobre a música em background de forma simultânea, mas com volumes independentes.
- **Fade In (Restore)**: Através do callback `onended` ou `onerror` da locução, o sistema aciona a função de restauro. O volume da música sobe gradativamente até seu volume base, transição que leva em torno de `2.0s` (configurável em `duckingFadeInTime`). O relógio de 120s é resetado.

## 4. Tratamento de Casos Extremos (Edge Cases)
- **Locução Interrompida / Erro de Rede**: Se a locução falhar (disparo de `onerror`), a função `restoreMusic()` é invocada imediatamente, subindo o volume da música para evitar o silêncio.
- **Background Tabs**: Em muitos navegadores, o `requestAnimationFrame` é interrompido se a aba estiver em segundo plano. Por isso, a função de `fadeVolume` usa `setInterval`, garantindo que o ducking aconteça em tempo real mesmo se a página não estiver focada (útil para Displays e TVs digitais headless).
- **Sobreposição (Overlap) de Locuções**: A variável de estado `isVoiceoverActiveRef` atua como _mutex lock_, impedindo que dois comandos de `startVoiceover()` sobreponham locuções.

## 5. Coleta de Logs e Monitoramento
Foram inseridos logs estruturados com o prefixo `[Audio Mixer]` para permitir depuração e monitoramento em tempo real de:
- Inicialização do sistema de áudio.
- Disparos de Música e Locução.
- Estágios de transição do _ducking_ (Ex: "Reduzindo volume da música para 10%").
- Tratamento de erros de reprodução.

## 6. Métricas de Performance Esperadas
- **Memory Footprint**: Baixo. Reutilizamos as mesmas duas instâncias do objeto `Audio` ao longo de toda a vida da aplicação, alterando apenas a propriedade `.src`. Não há _memory leaks_.
- **CPU Overhead**: O processamento em background usa dois timers leves (`100ms` para tracking geral, e um efêmero de `50ms` para as rampas de volume). O impacto de CPU é praticamente `0%`.
- **Compatibilidade**: Utilizar a Tag HTML5 Audio (`new Audio()`) tem suporte universal em dispositivos _Smart TVs_ legados, diferente de sistemas mais complexos com a `Web Audio API` (como `GainNode` para ducking) que muitas vezes não funcionam corretamente ou engasgam em processadores ARM fracos (comuns em painéis publicitários digitais).

## 7. Testes Unitários (Vitest)
Foram desenvolvidos testes simulando o tempo de execução através do relógio virtual do Vitest (`vi.useFakeTimers`). As suítes verificam:
- Reprodução contínua da música sem locução.
- Ducking exato e restauro após a simulação de 120s de reprodução com transições de volume corretas.
- Congelamento e retomada corretos da contagem do tempo nos casos onde a música falha ou interrompe (garantindo os exatos 120s de _active time_ e não _wall-clock time_).
