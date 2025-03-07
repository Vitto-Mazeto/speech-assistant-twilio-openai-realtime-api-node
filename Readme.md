# Agendador de Reuniões com Twilio Voice e OpenAI Realtime API (Node.js)

Esta aplicação demonstra como usar Node.js, [Twilio Voice](https://www.twilio.com/docs/voice) com [Media Streams](https://www.twilio.com/docs/voice/media-streams) e a [OpenAI Realtime API](https://platform.openai.com/docs/) para criar um assistente de voz que faz chamadas telefônicas para agendar reuniões de consultoria financeira.

A aplicação utiliza websockets com a OpenAI Realtime API e Twilio, transmitindo áudio de voz entre ambos para permitir uma conversa bidirecional, onde o assistente se apresenta como "Carol da Estratégia Investimentos".

Esta aplicação utiliza os seguintes produtos Twilio em conjunto com a OpenAI Realtime API:
- Voice (incluindo TwiML e Media Streams)
- Phone Numbers

## Funcionalidades Principais

- **Chamadas de entrada**: Recebe chamadas e conecta com a assistente virtual
- **Chamadas de saída**: Inicia chamadas para potenciais clientes através de uma API
- **Gravação de chamadas**: Armazena automaticamente todas as chamadas realizadas
- **Agendamento de reuniões**: Coleta informações do cliente e armazena os detalhes do agendamento
- **Interrupção inteligente**: Detecta quando o usuário começa a falar e interrompe a fala do assistente

## Pré-requisitos

Para usar esta aplicação, você precisará:

- **Node.js 18+**
- **Uma conta Twilio.** Você pode se inscrever para um teste gratuito [aqui](https://www.twilio.com/try-twilio).
- **Um número Twilio com capacidades de _Voice_.** [Aqui estão instruções](https://help.twilio.com/articles/223135247-How-to-Search-for-and-Buy-a-Twilio-Phone-Number-from-Console) para comprar um número de telefone.
- **Uma conta OpenAI e uma chave de API OpenAI.** Você pode se inscrever [aqui](https://platform.openai.com/).
  - **Acesso à OpenAI Realtime API**

## Configuração Local

Existem 4 passos necessários para colocar a aplicação em funcionamento localmente:
1. Execute ngrok ou outra solução de tunelamento para expor seu servidor local à internet para testes
2. Instale os pacotes
3. Configure o Twilio
4. Atualize o arquivo .env

### Abra um túnel ngrok
Ao desenvolver e testar localmente, você precisará abrir um túnel para encaminhar as solicitações para o seu servidor de desenvolvimento local.

Abra um Terminal e execute:
```
ngrok http 5050
```
Depois que o túnel for aberto, copie a URL de `Forwarding`. Será algo como: `https://[seu-subdomínio-ngrok].ngrok.app`. Você precisará disso ao configurar seu número Twilio.

### Instale os pacotes necessários

Abra um Terminal e execute:
```
npm install
```

### Configuração do Twilio

#### Configure um Número de Telefone para seu URL ngrok
No [Console do Twilio](https://console.twilio.com/), vá para **Phone Numbers** > **Manage** > **Active Numbers** e clique no número de telefone que você adquiriu para este aplicativo.

Nas configurações do seu número de telefone, atualize o primeiro dropdown **A call comes in** para **Webhook**, e cole sua URL de encaminhamento ngrok, seguida por `/incoming-call`. Por exemplo, `https://[seu-subdomínio-ngrok].ngrok.app/incoming-call`. Em seguida, clique em **Save configuration**.

### Atualize o arquivo .env

Crie um arquivo `.env` ou copie o arquivo `.env.example` para `.env`:

```
cp .env.example .env
```

No arquivo .env, atualize as seguintes variáveis:

```
OPENAI_API_KEY=sua-chave-api-openai
TWILIO_ACCOUNT_SID=seu-account-sid-twilio
TWILIO_AUTH_TOKEN=seu-auth-token-twilio
TWILIO_PHONE_NUMBER=seu-numero-twilio
PORT=5050 (opcional)
```

## Estrutura de Diretórios

A aplicação cria automaticamente os seguintes diretórios:
- `/recordings` - Onde todas as gravações de chamadas são armazenadas
- `/appointments` - Onde os dados de agendamento são salvos em formato JSON

## Executando a aplicação

Com o ngrok em execução, dependências instaladas, Twilio configurado adequadamente e o arquivo `.env` configurado, execute o servidor com o seguinte comando:

```
npm start
```

ou 

```
npm run dev
```

ou

```
node dist/index.js
```

## Testando a aplicação

### Para receber chamadas
Com o servidor de desenvolvimento em execução, ligue para o número de telefone que você configurou. Após a introdução, você poderá falar com o assistente de IA que se apresentará como Carol da Estratégia Investimentos.

### Para fazer chamadas de saída
Você pode iniciar chamadas de saída fazendo uma requisição POST para a rota `/make-call`:

```
curl -X POST https://c016-2804-14c-211-436f-4fbe-c93b-d7f4-2eaa.ngrok-free.app/make-call \
  -H "Content-Type: application/json" \
  -d '{"to": "+5511996046537", "message": "Mensagem inicial opcional"}'
```

## Personalização

### Instruções do sistema
Para modificar o comportamento da assistente virtual, você pode editar a variável `SYSTEM_INSTRUCTIONS` no arquivo `index.ts`. Isso controla como a IA se comporta durante as chamadas.

### Configuração do modelo
Você pode ajustar a configuração do modelo OpenAI modificando a variável `MODEL_CONFIG` no arquivo `index.ts`, incluindo:
- Modelo de linguagem (`model`)
- Voz (`voice`)
- Temperatura (`temperature`)
- Limite de tokens (`max_response_output_tokens`)
- Detecção de turnos (`turn_detection`)

## Arquivos de Dados

### Gravações
As gravações de chamadas são salvas no formato WAV no diretório `/recordings`. Os nomes dos arquivos incluem data/hora e ID da chamada.

### Agendamentos
Os dados de agendamento são salvos como arquivos JSON no diretório `/appointments`. Cada arquivo contém:
- Nome do cliente
- Email
- Dia preferido
- Horário preferido
- Número de telefone
- Notas adicionais
- ID da chamada
- Timestamp
