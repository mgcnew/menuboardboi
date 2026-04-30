# Documentação Técnica: Sistema de Agendamento de Propagandas

## 1. Visão Geral da Arquitetura
O sistema de agendamento permite que administradores configurem os dias exatos da semana em que uma imagem/propaganda promocional deve ser exibida. Foi desenvolvida uma arquitetura baseada em uma lógica robusta de filtragem e de reatividade no Frontend para garantir que as mídias corretas sejam mostradas sem que haja impacto no carregamento.

### 1.1 Principais Componentes
- **Tipagem `ImageAsset`**: Modificada para aceitar a propriedade `active_days` (`number[]`), que representa os dias em que a propaganda está habilitada (onde 0 = Domingo, 1 = Segunda, etc.).
- **Banco de Dados (Supabase)**: A tabela `images` agora possui uma nova coluna `active_days` de tipo array de inteiros (`int2[]`). O Supabase armazena essas regras para cada propaganda.
- **`useActiveImages` (Hook)**: Um custom hook focado apenas na responsabilidade de filtragem. Ele memoriza (`useMemo`) a lista base e filtra as imagens com base no dia atual retornado por `new Date().getDay()`.

## 2. Interface Administrativa (Painel Admin)
A interface de configuração conta com um componente de seleção de dias inserido em cada `image-card` (painel de "Fotos Promocionais"). 
- **Checkboxes visuais (Botões Circulares)**: Representam de Domingo a Sábado. Ao clicar num dia, ele é adicionado ou removido do array `active_days`.
- **Prevenção de Estado Vazio**: Para evitar que uma imagem não tenha nenhum dia de exibição, a interface não permite que o administrador desmarque o *último* dia restante.
- **Sincronização em Tempo Real**: Ao modificar o calendário, a função `updateImageDays` é invocada de forma assíncrona, salvando imediatamente a preferência no banco de dados e atualizando o estado do componente.

## 3. Lógica de Filtragem e Roteamento no Modo TV
O componente principal do Modo TV (`TvMode`) avalia os dias usando as seguintes premissas:
1. **Retrocompatibilidade**: Imagens antigas que não possuem o atributo `active_days` (ou que estão como `null`) serão interpretadas como válidas para *todos os dias* (comportamento padrão).
2. **Avaliação Diária**: O hook `useEffect` recarrega as métricas da empresa a cada 30 segundos, ao mesmo tempo em que a variável `currentDay` (dia atual do sistema) é reavaliada.
3. **Player Inteligente**: O player consome apenas a lista filtrada `activeImages`. Caso o dia vire (ex: de 23:59 de Segunda para 00:00 de Terça), a lista filtrada se readequa de forma automática, e a exibição passa a obedecer às novas regras de terça-feira sem a necessidade de intervenção manual ou de *refresh* na página (não havendo recarregamentos forçados).

## 4. Query SQL para o Supabase (Instrução de Deploy)
Para garantir o correto funcionamento do sistema, é necessário aplicar a seguinte instrução SQL no projeto Supabase (seja pelo Painel SQL Editor, ou adicionando numa migration local):

```sql
-- Adiciona a coluna active_days à tabela de imagens, 
-- como array de inteiros. O valor default garante que novas 
-- imagens sejam exibidas em todos os dias da semana.
ALTER TABLE public.images 
ADD COLUMN active_days smallint[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6];

-- Atualiza imagens já existentes para evitar problemas de compatibilidade
UPDATE public.images 
SET active_days = ARRAY[0, 1, 2, 3, 4, 5, 6] 
WHERE active_days IS NULL;
```

## 5. Testes Unitários
Foi desenvolvida uma suíte de testes usando Vitest (`useActiveImages.test.ts`) que avalia todos os casos de uso:
- Imagens designadas para um dia específico (ex: segunda, quarta, sexta).
- Imagens designadas para finais de semana.
- Imagens antigas sem `active_days` (garantindo que elas passam no filtro com segurança).
- Arrays vazios (quando não há imagem carregada).
Todos os testes validam o comportamento da função com mocks de dados, isolando totalmente o cálculo do calendário.
