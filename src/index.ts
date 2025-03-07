import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import Twilio from "twilio";
import {
  Env,
  ModelConfig,
  TwilioEvent,
  OpenAIOutgoingMessage,
  OpenAIIncomingMessage,
  MakeCallRequestBody,
} from "./types";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs-extra";
import axios from "axios";

// Load environment variables from .env file
dotenv.config();

// Retrieve the environment variables
const env: Partial<Env> = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  PORT: process.env.PORT || 5050,
};

if (!env.OPENAI_API_KEY) {
  console.error("Missing OpenAI API key. Please set it in the .env file.");
  process.exit(1);
}

if (
  !env.TWILIO_ACCOUNT_SID ||
  !env.TWILIO_AUTH_TOKEN ||
  !env.TWILIO_PHONE_NUMBER
) {
  console.error(
    "Credenciais do Twilio ausentes. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE_NUMBER no arquivo .env"
  );
  process.exit(1);
}

// Initialize Fastify
const fastify: FastifyInstance = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const recordingsDir = path.join(__dirname, "../recordings");
fs.ensureDirSync(recordingsDir);
console.log(`Recordings will be saved to: ${recordingsDir}`);

const appointmentsDir = path.join(__dirname, "../appointments");
fs.ensureDirSync(appointmentsDir);
console.log(`Appointments will be saved to: ${appointmentsDir}`);

// Register static file server for recordings
fastify.register(fastifyStatic, {
  root: recordingsDir,
  prefix: "/recordings/",
  decorateReply: false,
});

// Initialize Twilio client
const twilioClient = Twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

// Model configuration and system instructions
const MODEL_CONFIG: ModelConfig = {
  model: "gpt-4o-mini-realtime-preview-2024-12-17",
  voice: "shimmer",
  temperature: 0.62,
  max_response_output_tokens: 500,
  turn_detection: {
    type: "server_vad",
    threshold: 0.43,
    prefix_padding_ms: 400,
    silence_duration_ms: 540,
  },
};

// Updated system instructions
const SYSTEM_INSTRUCTIONS: string = `Your main goal is to schedule a meeting with a consultant by gathering all necessary information and using the schedule_appointment tool. This is the ONLY purpose of this call.

# Details
- Position yourself as Carol from Estratégia Investimentos
- You are conducting cold calls
- The meeting should be scheduled for next week
- You MUST collect the following information before ending the call:
  1. Customer's full name (required)
  2. Email address (required)
  3. Preferred day for appointment (required)
  4. Preferred time for appointment (required)
  5. Phone number (already have from the call)
  6. Any specific investment interests or questions (as additional notes)

# Call Flow
1. Begin with a friendly introduction as Carol from Estratégia Investimentos
2. Explain that you're calling to schedule a free investment consultation
3. Ask for and confirm their name
4. Ask for their email for sending confirmation
5. Ask which day next week works best for them
6. Ask what time on that day works best
7. Ask if they have any specific investment interests or questions
8. USE THE SCHEDULE_APPOINTMENT TOOL to save their information
9. After scheduling, confirm the appointment details and thank them

# Tone and Speech
- Speak with a São Paulo business district accent, specifically from the Faria Lima area
- Speak at a fast pace to maintain engagement
- Use a persuasive and confident tone of voice
- Be emotionally engaging and friendly
- Project enthusiasm and conviction in your voice

# Reminders
- ALWAYS use the schedule_appointment tool to save appointment details
- Do not end the call without scheduling an appointment
- If the person hesitates, emphasize the no-obligation nature of the consultation
- Always try to collect ALL required information: name, email, day, and time`;

const PORT: number = Number(env.PORT) || 5050; // Allow dynamic port assignment

// List of Event Types to log to the console
const LOG_EVENT_TYPES: string[] = [
  "error",
  "response.content.done",
  "rate_limits.updated",
  "response.done",
  "input_audio_buffer.committed",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.speech_started",
  "session.created",
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH: boolean = false;

// Root Route
fastify.get("/", async (request, reply) => {
  reply.send({ message: "Twilio Media Stream Server is running!" });
});

// Route for Twilio to handle incoming calls
fastify.all("/incoming-call", async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say>Por favor, aguarde enquanto conectamos sua chamada com Carol da Estratégia Investimentos</Say>
                              <Pause length="1"/>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// Rota para iniciar chamadas de saída
fastify.post<{
  Body: MakeCallRequestBody;
}>("/make-call", async (request, reply) => {
  try {
    const { to, message } = request.body;
    const host = request.headers.host;

    if (!to) {
      return reply
        .status(400)
        .send({ error: "Número de telefone de destino (to) é obrigatório" });
    }

    // Add recording for outbound calls
    const call = await twilioClient.calls.create({
      to: to,
      from: env.TWILIO_PHONE_NUMBER!,
      record: true, // Enable recording directly
      recordingStatusCallback: `https://${host}/recording-completed`, // Use host from request
      recordingStatusCallbackEvent: ["completed"],
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
              <Response>
                <Say>Esta chamada está sendo gravada. ${
                  message || "Olá, aqui é a Carol da Estratégia Investimentos"
                }</Say>
                <Connect>
                  <Stream url="wss://${host}/media-stream" />
                </Connect>
              </Response>`,
    });

    return reply.send({
      success: true,
      message: "Chamada iniciada com sucesso com gravação",
      callSid: call.sid,
    });
  } catch (error: any) {
    console.error("Erro ao fazer chamada:", error);
    return reply.status(500).send({
      error: "Falha ao iniciar chamada",
      details: error.message,
    });
  }
});

// Add a route to handle recording completion callback
fastify.all(
  "/recording-completed",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Extract recording details from request body
      const body = request.body as any;
      console.log("Recording completed callback received:", body);

      const recordingSid = body.RecordingSid;
      const recordingUrl = body.RecordingUrl;
      const callSid = body.CallSid;
      const dateCreated = body.DateCreated || new Date().toISOString();

      if (recordingUrl && recordingSid) {
        // Download the recording
        console.log(`Downloading recording: ${recordingUrl}`);

        // Generate filename with date and call SID
        const date = new Date(dateCreated).toISOString().replace(/[:.]/g, "-");
        const filename = `${date}_${callSid}_${recordingSid}.wav`;
        const filePath = path.join(recordingsDir, filename);

        // Get the recording in WAV format
        const recordingResponse = await axios({
          method: "GET",
          url: `${recordingUrl}.wav`,
          auth: {
            username: env.TWILIO_ACCOUNT_SID!,
            password: env.TWILIO_AUTH_TOKEN!,
          },
          responseType: "stream",
        });

        // Save the recording
        const writer = fs.createWriteStream(filePath);
        recordingResponse.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on("finish", () => resolve());
          writer.on("error", (err) => reject(err));
        });

        console.log(`Recording saved to: ${filePath}`);
      } else {
        console.warn("Recording information incomplete:", body);
      }

      reply.send({ status: "success" });
    } catch (error) {
      console.error("Error processing recording:", error);
      reply
        .status(500)
        .send({ status: "error", message: (error as Error).message });
    }
  }
);

// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get("/media-stream", { websocket: true }, function (connection, req) {
    console.log("Client connected");

    // Connection-specific state
    let streamSid: string | null = null;
    let latestMediaTimestamp: number = 0;
    let lastAssistantItem: string | null = null;
    let markQueue: string[] = [];
    let responseStartTimestampTwilio: number | null = null;

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${MODEL_CONFIG.model}`,
      {
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    // Control initial session with OpenAI
    const initializeSession = (): void => {
      const sessionUpdate: OpenAIOutgoingMessage = {
        type: "session.update",
        session: {
          turn_detection: MODEL_CONFIG.turn_detection,
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: MODEL_CONFIG.voice,
          instructions: SYSTEM_INSTRUCTIONS,
          modalities: ["text", "audio"],
          temperature: MODEL_CONFIG.temperature,
          max_response_output_tokens: MODEL_CONFIG.max_response_output_tokens,
          // Add tools property for function calling
          tools: [
            {
              type: "function",
              name: "schedule_appointment",
              description:
                "Schedule an appointment with a consultant for the customer",
              parameters: {
                type: "object",
                properties: {
                  customer_name: {
                    type: "string",
                    description: "The full name of the customer",
                  },
                  email: {
                    type: "string",
                    description:
                      "Customer's email address for the appointment confirmation",
                  },
                  preferred_day: {
                    type: "string",
                    description:
                      "The preferred day for the appointment, e.g. 'Monday', 'Tuesday'",
                  },
                  preferred_time: {
                    type: "string",
                    description:
                      "The preferred time for the appointment, e.g. '10:00', '15:30'",
                  },
                },
                required: ["customer_name", "preferred_day", "preferred_time"],
              },
            },
          ],
          tool_choice: "auto",
        },
      };

      console.log("Sending session update:", JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));

      // Uncomment to have AI speak first (now enabled by default):
      // sendInitialConversationItem();
    };

    // Send initial conversation item if AI talks first
    const sendInitialConversationItem = (): void => {
      const initialConversationItem: OpenAIOutgoingMessage = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Inicie uma ligação como Carol da Estratégia Investimentos fazendo uma chamada a frio para agendar uma reunião com um consultor na próxima semana.",
            },
          ],
        },
      };

      if (SHOW_TIMING_MATH)
        console.log(
          "Sending initial conversation item:",
          JSON.stringify(initialConversationItem)
        );
      openAiWs.send(JSON.stringify(initialConversationItem));
      openAiWs.send(JSON.stringify({ type: "response.create" }));
    };

    // Handle interruption when the caller's speech starts
    const handleSpeechStartedEvent = (): void => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        if (SHOW_TIMING_MATH)
          console.log(
            `Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`
          );

        if (lastAssistantItem) {
          const truncateEvent: OpenAIOutgoingMessage = {
            type: "conversation.item.truncate",
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          };
          if (SHOW_TIMING_MATH)
            console.log(
              "Sending truncation event:",
              JSON.stringify(truncateEvent)
            );
          openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(
          JSON.stringify({
            event: "clear",
            streamSid: streamSid,
          })
        );

        // Reset
        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    // Send mark messages to Media Streams so we know if and when AI response playback is finished
    const sendMark = (conn: any, sid: string | null): void => {
      if (sid) {
        const markEvent = {
          event: "mark",
          streamSid: sid,
          mark: { name: "responsePart" },
        };
        conn.socket.send(JSON.stringify(markEvent));
        markQueue.push("responsePart");
      }
    };

    // Open event for OpenAI WebSocket
    openAiWs.on("open", () => {
      console.log("Connected to the OpenAI Realtime API");
      setTimeout(initializeSession, 100);
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on("message", (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString()) as OpenAIIncomingMessage;

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response);
        }

        if (response.type === "response.audio.delta" && "delta" in response) {
          const audioDelta = {
            event: "media",
            streamSid: streamSid,
            media: { payload: response.delta },
          };
          connection.send(JSON.stringify(audioDelta));

          // First delta from a new response starts the elapsed time counter
          if (!responseStartTimestampTwilio) {
            responseStartTimestampTwilio = latestMediaTimestamp;
            if (SHOW_TIMING_MATH)
              console.log(
                `Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`
              );
          }

          if ("item_id" in response && response.item_id) {
            lastAssistantItem = response.item_id;
          }

          sendMark(connection, streamSid);
        }

        if (response.type === "input_audio_buffer.speech_started") {
          handleSpeechStartedEvent();
        }

        if (
          response.type === "response.done" &&
          response.response &&
          response.response.output
        ) {
          console.log(
            "Processing response.done event:",
            JSON.stringify(response)
          );

          const outputItems = response.response.output;

          for (const item of outputItems) {
            if (
              item.type === "function_call" &&
              item.name === "schedule_appointment"
            ) {
              console.log(
                "Appointment function called with arguments:",
                item.arguments
              );

              try {
                const args = JSON.parse(item.arguments);
                const call_id = item.call_id;

                // Save the appointment details to a file
                const appointmentData = {
                  customer_name: args.customer_name || "Unknown",
                  email: args.email || "",
                  preferred_day: args.preferred_day || "",
                  preferred_time: args.preferred_time || "",
                  phone_number: args.phone_number || "",
                  additional_notes: args.additional_notes || "",
                  call_sid: streamSid || "unknown_call",
                  timestamp: new Date().toISOString(),
                };

                // Create a filename with timestamp
                const filename = `${appointmentData.timestamp.replace(
                  /[:.]/g,
                  "-"
                )}_${appointmentData.customer_name.replace(/\s+/g, "_")}.json`;
                const filePath = path.join(appointmentsDir, filename);

                // Write the appointment data to a file
                fs.writeJsonSync(filePath, appointmentData, { spaces: 2 });
                console.log(`Appointment saved to: ${filePath}`);

                // Send function call result back to OpenAI
                const functionResult = {
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: call_id,
                    output: JSON.stringify({
                      status: "success",
                      message: `Appointment scheduled for ${args.customer_name} on ${args.preferred_day} at ${args.preferred_time}`,
                      confirmation_code: `APPT-${Math.floor(
                        100000 + Math.random() * 900000
                      )}`,
                    }),
                  },
                };

                console.log(
                  "Sending function result back to OpenAI:",
                  JSON.stringify(functionResult)
                );

                // Send the function result back to OpenAI
                openAiWs.send(JSON.stringify(functionResult));

                // Continue the conversation by creating a new response
                openAiWs.send(JSON.stringify({ type: "response.create" }));
              } catch (error) {
                console.error(
                  "Error processing appointment function call:",
                  error
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          "Error processing OpenAI message:",
          error,
          "Raw message:",
          data
        );
      }
    });

    // Handle incoming messages from Twilio
    connection.on("message", (message: WebSocket.Data) => {
      try {
        const data = JSON.parse(message.toString()) as TwilioEvent;

        switch (data.event) {
          case "media":
            if ("media" in data && "timestamp" in data.media) {
              latestMediaTimestamp = data.media.timestamp;
              if (SHOW_TIMING_MATH)
                console.log(
                  `Received media message with timestamp: ${latestMediaTimestamp}ms`
                );
              if (openAiWs.readyState === WebSocket.OPEN) {
                const audioAppend: OpenAIOutgoingMessage = {
                  type: "input_audio_buffer.append",
                  audio: data.media.payload,
                };
                openAiWs.send(JSON.stringify(audioAppend));
              }
            }
            break;
          case "start":
            if ("start" in data && "streamSid" in data.start) {
              streamSid = data.start.streamSid;
              console.log("Incoming stream has started", streamSid);

              // Reset start and media timestamp on a new stream
              responseStartTimestampTwilio = null;
              latestMediaTimestamp = 0;
            }
            break;
          case "mark":
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          default:
            console.log("Received non-media event:", data.event);
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error, "Message:", message);
      }
    });

    // Handle connection close
    connection.on("close", () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      console.log("Client disconnected.");
    });

    // Handle WebSocket close and errors
    openAiWs.on("close", () => {
      console.log("Disconnected from the OpenAI Realtime API");
    });

    openAiWs.on("error", (error: Error) => {
      console.error("Error in the OpenAI WebSocket:", error);
    });
  });
});

fastify.listen({ port: PORT }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});
