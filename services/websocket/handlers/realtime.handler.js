const WebSocket = require('ws');
const { buildRealtimeConfig } = require('../../realtime.service');
const { emitError, emitSuccess } = require('../utils');
const { handleError, validateMessage } = require('./base.handler');

// Manage realtime sessions
const realtimeSessions = new Map();

const connectRealtime = (sessionId) => {
  const { url, headers, model } = buildRealtimeConfig();
  const ws = new WebSocket(url, { headers });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ws.removeAllListeners();
    };

    ws.on('open', () => {
      // Configure session for PCM16 @16k mono and text output
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            model,
            modalities: ['text'],
            input_audio_format: 'pcm16',
            sample_rate: 16000,
            // Keep output audio disabled for now
            // output_audio_format: 'pcm16',
            instructions: 'Real-time transcription',
          },
        })
      );
      resolve(ws);
    });

    ws.on('error', (err) => {
      cleanup();
      reject(err);
    });

    ws.on('close', () => {
      cleanup();
    });
  });
};

const handleRealtimeStart = async (socket, data) => {
  try {
    validateMessage(data, []); // no required fields
    const sessionId = data.sessionId || socket.id;

    if (realtimeSessions.has(sessionId)) {
      emitError(socket, sessionId, 'Realtime session already exists', 'SESSION_EXISTS');
      return;
    }

    const ws = await connectRealtime(sessionId);

    // Listen for OpenAI Realtime messages and forward deltas
    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        // Listen for text delta
        if (parsed.type === 'response.output_text.delta') {
          emitSuccess(socket, 'transcription_delta', sessionId, {
            text: parsed.delta || '',
            isPartial: true,
          });
        }
        if (parsed.type === 'response.output_text.done') {
          emitSuccess(socket, 'transcription', sessionId, {
            text: parsed.text || '',
            isPartial: false,
          });
        }
      } catch (err) {
        // Ignore non-JSON (binary audio from API if any)
      }
    });

    realtimeSessions.set(sessionId, { ws, committed: false });

    emitSuccess(socket, 'realtime_session_started', sessionId, { sessionId, model: 'gpt-4o-mini-realtime' });
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

const handleRealtimeAudioChunk = async (socket, data) => {
  try {
    validateMessage(data, ['sessionId', 'chunk']);
    const { sessionId, chunk } = data;
    const session = realtimeSessions.get(sessionId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      emitError(socket, sessionId, 'Realtime session not found or closed', 'SESSION_NOT_FOUND');
      return;
    }

    // chunk is base64 PCM16 16k mono from frontend
    if (!chunk || typeof chunk !== 'string') {
      return;
    }

    session.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: chunk, // base64 PCM16
      })
    );
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

const handleRealtimeStop = async (socket, data) => {
  try {
    validateMessage(data, ['sessionId']);
    const { sessionId } = data;
    const session = realtimeSessions.get(sessionId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      emitError(socket, sessionId, 'Realtime session not found or closed', 'SESSION_NOT_FOUND');
      return;
    }

    // Commit current audio buffer and request a response
    session.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.commit',
      })
    );
    session.ws.send(
      JSON.stringify({
        type: 'response.create',
      })
    );

    emitSuccess(socket, 'processing', sessionId, { status: 'transcribing' });
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

const handleRealtimeCancel = async (socket, data) => {
  try {
    validateMessage(data, ['sessionId']);
    const { sessionId } = data;
    const session = realtimeSessions.get(sessionId);
    if (session && session.ws) {
      session.ws.close();
      realtimeSessions.delete(sessionId);
      emitSuccess(socket, 'realtime_cancelled', sessionId, { sessionId });
    } else {
      emitError(socket, sessionId, 'Realtime session not found', 'SESSION_NOT_FOUND');
    }
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

const handleRealtimeDisconnect = (sessionId) => {
  const session = realtimeSessions.get(sessionId);
  if (session && session.ws) {
    session.ws.close();
    realtimeSessions.delete(sessionId);
  }
};

module.exports = {
  handleRealtimeStart,
  handleRealtimeAudioChunk,
  handleRealtimeStop,
  handleRealtimeCancel,
  handleRealtimeDisconnect,
};

