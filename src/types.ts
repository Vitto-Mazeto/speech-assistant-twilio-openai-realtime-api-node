import { WebSocket } from "ws";

// For request body typing
export interface MakeCallRequestBody {
  to: string;
  message?: string;
}

// For Fastify WebSocket
export interface SocketStream {
  socket: WebSocket;
}

// Environment variables
export interface Env {
  OPENAI_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  PORT?: string | number;
}

// OpenAI Model Configuration
export interface ModelConfig {
  model: string;
  voice: string;
  temperature: number;
  max_response_output_tokens: number;
  turn_detection: {
    type: string;
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
}

// Twilio Media Event
export interface TwilioMediaEvent {
  event: "media";
  streamSid: string;
  media: {
    payload: string;
    timestamp: number;
  };
}

// Twilio Start Event
export interface TwilioStartEvent {
  event: "start";
  start: {
    streamSid: string;
  };
}

// Twilio Mark Event
export interface TwilioMarkEvent {
  event: "mark";
  mark: {
    name: string;
  };
  streamSid?: string;
}

// Twilio Clear Event
export interface TwilioClearEvent {
  event: "clear";
  streamSid: string;
}

// Union type for all Twilio events
export type TwilioEvent =
  | TwilioMediaEvent
  | TwilioStartEvent
  | TwilioMarkEvent
  | TwilioClearEvent
  | { event: string; [key: string]: any };

// OpenAI Session Update Message
export interface OpenAISessionUpdate {
  type: "session.update";
  session: {
    turn_detection: {
      type: string;
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
    };
    input_audio_format: string;
    output_audio_format: string;
    voice: string;
    instructions: string;
    modalities: string[];
    temperature: number;
    max_response_output_tokens: number;
  };
}

// OpenAI Conversation Item Create Message
export interface OpenAIConversationItemCreate {
  type: "conversation.item.create";
  item: {
    type: string;
    role: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  };
}

// OpenAI Response Create Message
export interface OpenAIResponseCreate {
  type: "response.create";
}

// OpenAI Audio Append Message
export interface OpenAIAudioAppend {
  type: "input_audio_buffer.append";
  audio: string;
}

// OpenAI Truncate Message
export interface OpenAITruncate {
  type: "conversation.item.truncate";
  item_id: string;
  content_index: number;
  audio_end_ms: number;
}

// Union type for all outgoing OpenAI messages
export type OpenAIOutgoingMessage =
  | OpenAISessionUpdate
  | OpenAIConversationItemCreate
  | OpenAIResponseCreate
  | OpenAIAudioAppend
  | OpenAITruncate;

// OpenAI Audio Delta Message
export interface OpenAIAudioDelta {
  type: "response.audio.delta";
  delta: string;
  item_id?: string;
}

// OpenAI Speech Event Message
export interface OpenAISpeechEvent {
  type:
    | "input_audio_buffer.speech_started"
    | "input_audio_buffer.speech_stopped";
}

// Union type for all incoming OpenAI messages
export type OpenAIIncomingMessage =
  | OpenAIAudioDelta
  | OpenAISpeechEvent
  | { type: string; [key: string]: any };

// Connection state
export interface ConnectionState {
  streamSid: string | null;
  latestMediaTimestamp: number;
  lastAssistantItem: string | null;
  markQueue: string[];
  responseStartTimestampTwilio: number | null;
  openAiWs: WebSocket;
}

// Declare module for Twilio as it may not be properly typed
declare module "twilio" {
  export default function (accountSid: string, authToken: string): any;
}
