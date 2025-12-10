const whisperService = require('../../whisper.service');
const gptService = require('../../gpt.service');
const { audioBufferManager, generateSessionId, emitError, emitSuccess } = require('../utils');
const { handleError, validateMessage } = require('./base.handler');
const { VOICE_SETTINGS } = require('../../../config/websocket');

const voiceOrderSessions = new Map();
const generateOrderSessionId = () => `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const MIN_AUDIO_BYTES = 16000; // ~1.5s at 16k mono; skip processing if below

const getOrCreateVoiceOrderSession = (orderSessionId, socketId) => {
  const id = orderSessionId || generateOrderSessionId();
  if (!voiceOrderSessions.has(id)) {
    voiceOrderSessions.set(id, {
      messages: [],
      isCompleted: false,
      socketId,
      cartItems: [], // Store cart items for UI display
      total: 0, // Store total for UI display
    });
  }
  return { orderSessionId: id, session: voiceOrderSessions.get(id) };
};

const clearVoiceOrderSession = (orderSessionId) => {
  if (orderSessionId && voiceOrderSessions.has(orderSessionId)) {
    voiceOrderSessions.delete(orderSessionId);
  }
};

const handleVoiceStart = async (socket, data) => {
  try {
    console.log('[Voice Handler] 🎤 handleVoiceStart called');
    console.log('[Voice Handler] 🎤 handleVoiceStart called');
    validateMessage(data, []);

    const sessionId = data.sessionId || generateSessionId();
    const orderSessionId = data.orderSessionId || null;
    const audioFormat = data.audioFormat || 'webm'; // Default to webm, client can override
    const { userId, tenantId } = socket.data;

    console.log('[Voice Handler] 📝 Generated sessionId:', sessionId);
    console.log('[Voice Handler] 👤 User:', userId, 'Tenant:', tenantId);
    console.log('[Voice Handler] 🎵 Audio format:', audioFormat);

    const voiceSession = getOrCreateVoiceOrderSession(orderSessionId, socket.id);

    // Delete any existing session with same ID first to ensure clean start
    if (audioBufferManager.getSession(sessionId)) {
      console.log('[Voice Handler] 🗑️ Deleting existing session before creating new one:', sessionId);
      audioBufferManager.deleteSession(sessionId);
    }

    if (audioBufferManager.createSession(sessionId)) {
      // Attach orderSessionId, socketId, and audioFormat to audio session
      const session = audioBufferManager.getSession(sessionId);
      if (session) {
        session.orderSessionId = voiceSession.orderSessionId;
        session.socketId = socket.id;
        session.audioFormat = audioFormat; // Store audio format from client
        console.log('[Voice Handler] 📝 Session created with audioFormat:', audioFormat);
      }

      console.log('[Voice Handler] ✅ Session created successfully');
      emitSuccess(socket, 'voice_session_started', sessionId, {
        sessionId,
        orderSessionId: voiceSession.orderSessionId,
        userId,
        tenantId,
      });
      console.log('[Voice Handler] 📤 Emitted voice_session_started event');
    } else {
      console.log('[Voice Handler] ⚠️ Session already exists:', sessionId);
      emitError(socket, sessionId, 'Session already exists', 'SESSION_EXISTS');
    }
  } catch (error) {
    console.error('[Voice Handler] ❌ Error in handleVoiceStart:', error.message);
    handleError(socket, error, data?.sessionId);
  }
};

const handleAudioChunk = async (socket, data) => {
  try {
    validateMessage(data, ['sessionId', 'chunk']);

    const { sessionId, chunk } = data;
    const session = audioBufferManager.getSession(sessionId);

    if (!session) {
      // Silently ignore chunks for non-existent sessions
      // This can happen if chunks arrive after session was deleted due to error
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Ignoring chunk for non-existent session: ${sessionId}`);
      }
      return;
    }

    audioBufferManager.appendChunk(sessionId, chunk);

    emitSuccess(socket, 'audio_chunk_received', sessionId, {
      sessionId,
      chunkIndex: session.chunks.length,
      totalSize: session.totalSize,
    });

    // Check if we should do partial transcription
    const timeSinceLastTranscription = Date.now() - (session.lastTranscriptionTime || session.createdAt);
    const chunksSinceLastTranscription = session.chunks.length - (session.lastTranscriptionIndex || 0);
    
    if (
      timeSinceLastTranscription >= VOICE_SETTINGS.partialTranscriptionInterval &&
      chunksSinceLastTranscription >= VOICE_SETTINGS.partialTranscriptionMinChunks
    ) {
      // Do partial transcription in background (don't await to avoid blocking)
      handlePartialTranscription(socket, sessionId).catch((error) => {
        // Silently fail partial transcription to not interrupt recording
        if (process.env.NODE_ENV === 'development') {
          console.error('Partial transcription error:', error.message);
        }
      });
    }
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

// Handle partial transcription for real-time display
const handlePartialTranscription = async (socket, sessionId) => {
  try {
    console.log('[Voice Handler] 🔄 Starting partial transcription for session:', sessionId);
    
    const session = audioBufferManager.getSession(sessionId);
    if (!session) {
      console.log('[Voice Handler] ⚠️ Session not found for partial transcription:', sessionId);
      return;
    }

    // Prevent concurrent partial transcriptions per session
    if (session.isPartialTranscribing) {
      console.log('[Voice Handler] ⚠️ Partial transcription already in progress, skipping');
      return;
    }
    session.isPartialTranscribing = true;

    const partialBuffer = audioBufferManager.getChunksSinceLastTranscription(sessionId);
    if (!partialBuffer || partialBuffer.length === 0) {
      console.log('[Voice Handler] ⚠️ No new chunks to transcribe');
      session.isPartialTranscribing = false;
      return;
    }

    console.log('[Voice Handler] 📊 Partial buffer size:', partialBuffer.length, 'bytes');

    // Only transcribe if we have enough audio data (~2 seconds @16kHz ≈ 64KB) for accuracy
    if (partialBuffer.length < 64000) {
      console.log('[Voice Handler] ⚠️ Buffer too small, need at least ~64KB, got:', partialBuffer.length);
      session.isPartialTranscribing = false;
      return;
    }

    const audioFormat = session.audioFormat || 'webm';
    const filename = `voice_partial_${sessionId}_${Date.now()}.${audioFormat}`;
    console.log('[Voice Handler] 📁 Partial transcription filename:', filename);

    let transcription;
    try {
      console.log('[Voice Handler] 📤 Calling Whisper service for partial transcription...');
      transcription = await whisperService.transcribeFromBuffer(partialBuffer, filename, {
        language: 'vi',
      });
      console.log('[Voice Handler] ✅ Partial transcription successful:', transcription.text?.substring(0, 50) || 'N/A');
    } catch (error) {
      // Log error but don't interrupt recording
      console.error('[Voice Handler] ❌ Partial transcription failed:', error.message);
      if (error.stack) {
        console.error('[Voice Handler] ❌ Stack:', error.stack);
      }
      return;
    }

    // Update last transcription index
    audioBufferManager.updateLastTranscriptionIndex(sessionId);

    // Emit partial transcription result
    emitSuccess(socket, 'partial_transcription', sessionId, {
      text: transcription.text,
      language: transcription.language || 'vi',
      isPartial: true,
    });
    console.log('[Voice Handler] 📤 Emitted partial transcription to client');
  } catch (error) {
    // Log error but don't interrupt recording
    console.error('[Voice Handler] ❌ Partial transcription error:', error.message);
    if (error.stack) {
      console.error('[Voice Handler] ❌ Stack:', error.stack);
    }
  } finally {
    const session = audioBufferManager.getSession(sessionId);
    if (session) {
      session.isPartialTranscribing = false;
    }
  }
};

const handleVoiceStop = async (socket, data) => {
  let sessionId = null;
  let orderSessionId = null;

  try {
    validateMessage(data, ['sessionId']);

    sessionId = data.sessionId;
    const { userId, tenantId } = socket.data;

    const session = audioBufferManager.getSession(sessionId);
    if (!session) {
      emitError(socket, sessionId, 'Session not found', 'SESSION_NOT_FOUND');
      return;
    }
    orderSessionId = session.orderSessionId;

    if (session.chunks.length === 0) {
      emitError(socket, sessionId, 'No audio data received', 'NO_AUDIO_DATA');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    // Guard: audio too short
    if (session.totalSize < MIN_AUDIO_BYTES) {
      emitSuccess(socket, 'voice_response', sessionId, {
        content: 'Không nhận được âm thanh đủ dài.',
      });
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    emitSuccess(socket, 'processing', sessionId, {
      status: 'transcribing',
    });

    console.log('[Voice Handler] 🛑 Voice stop received for session:', sessionId);
    console.log('[Voice Handler] 📊 Total chunks:', session.chunks.length);
    console.log('[Voice Handler] 📊 Total buffer size:', session.totalSize, 'bytes');

    // Validate minimum audio size before processing (MIN_AUDIO_BYTES is defined at top of file)
    if (session.totalSize < MIN_AUDIO_BYTES) {
      emitError(socket, sessionId, `Audio too short. Minimum ${MIN_AUDIO_BYTES} bytes required, got ${session.totalSize} bytes.`, 'AUDIO_TOO_SHORT');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    let audioBuffer;
    try {
      audioBuffer = audioBufferManager.mergeChunks(sessionId);
    } catch (error) {
      console.error('[Voice Handler] ❌ Failed to merge chunks:', error.message);
      emitError(socket, sessionId, `Failed to process audio: ${error.message}`, 'AUDIO_PROCESSING_ERROR');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    // Validate audio buffer is not empty and has reasonable size
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error('[Voice Handler] ❌ Audio buffer is empty');
      emitError(socket, sessionId, 'Audio buffer is empty', 'AUDIO_EMPTY');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    // Log first few bytes to verify it's actual audio data (not text)
    const previewBytes = audioBuffer.slice(0, Math.min(20, audioBuffer.length));
    console.log('[Voice Handler] 🔍 Audio buffer preview (first 20 bytes):', previewBytes.toString('hex'));
    
    // Check if buffer looks like audio (should not be all zeros or all same value)
    const uniqueBytes = new Set(previewBytes);
    if (uniqueBytes.size < 3) {
      console.warn('[Voice Handler] ⚠️ Audio buffer may be invalid - too few unique byte values');
    }

    const audioFormat = session.audioFormat || 'webm';
    const filename = `voice_${sessionId}.${audioFormat}`;

    console.log('[Voice Handler] 📁 Final transcription filename:', filename);
    console.log('[Voice Handler] 📊 Merged buffer size:', audioBuffer.length, 'bytes');
    console.log('[Voice Handler] 🎵 Audio format:', audioFormat);
    console.log('[Voice Handler] 📤 Calling Whisper service for final transcription...');

    let transcription;
    try {
      transcription = await whisperService.transcribeFromBuffer(audioBuffer, filename, {
        language: 'vi',
      });
      console.log('[Voice Handler] ✅ Final transcription successful!');
      console.log('[Voice Handler] 📝 Transcription text:', transcription.text?.substring(0, 100) || 'N/A');
    } catch (error) {
      console.error('[Voice Handler] ❌ Final transcription failed!');
      console.error('[Voice Handler] ❌ Error:', error.message);
      if (error.stack) {
        console.error('[Voice Handler] ❌ Stack:', error.stack);
      }
      emitError(socket, sessionId, `Transcription failed: ${error.message}`, 'TRANSCRIPTION_ERROR');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    emitSuccess(socket, 'transcription', sessionId, {
      text: transcription.text,
      language: transcription.language || 'vi',
    });

    // If transcription empty, skip GPT/tool calls
    if (!transcription.text || !transcription.text.trim()) {
      emitSuccess(socket, 'voice_response', sessionId, {
        content: 'Không nhận được nội dung giọng nói.',
      });
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    emitSuccess(socket, 'processing', sessionId, {
      status: 'processing_order',
    });

    // Build history from voice order session
    const voiceOrder = getOrCreateVoiceOrderSession(orderSessionId, socket.id);
    const history = voiceOrder.session.messages || [];
    
    // Validate history - ensure no orphaned tool messages
    // Tool messages must follow a message with tool_calls
    // Also ensure all assistant messages with tool_calls have corresponding tool results
    const validatedHistory = [];
    let i = 0;
    
    while (i < history.length) {
      const msg = history[i];
      
      // Check if this is an assistant message with tool_calls
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Count how many valid tool results follow this assistant message
        const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
        let toolResultCount = 0;
        let j = i + 1;
        
        // Look ahead to find matching tool results
        while (j < history.length && history[j].role === 'tool') {
          const toolMsg = history[j];
          if (toolCallIds.has(toolMsg.tool_call_id)) {
            toolResultCount++;
            j++;
          } else {
            // Non-matching tool message, stop here
            break;
          }
        }
        
        // If not all tool calls have responses, skip this entire block (assistant + tool messages)
        if (toolResultCount < msg.tool_calls.length) {
          console.warn('[Voice Handler] ⚠️ Assistant message with tool_calls at index', i, 'has', msg.tool_calls.length, 'tool_calls but only', toolResultCount, 'tool results. Skipping entire block to avoid API error.');
          // Skip to after all tool messages
          i = j;
          continue;
        }
        
        // All tool calls have responses, add assistant message
        validatedHistory.push(msg);
        i++;
        
        // Add all matching tool messages
        while (i < history.length && history[i].role === 'tool') {
          const toolMsg = history[i];
          if (toolCallIds.has(toolMsg.tool_call_id)) {
            validatedHistory.push(toolMsg);
            i++;
          } else {
            // Non-matching tool message, stop here
            break;
          }
        }
        continue;
      }
      
      // For tool messages, they should have been handled above
      if (msg.role === 'tool') {
        console.warn('[Voice Handler] ⚠️ Skipping orphaned tool message at index', i, '- no preceding assistant message with tool_calls');
        i++;
        continue;
      }
      
      // For other message types (user, assistant without tool_calls), add them
      validatedHistory.push(msg);
      i++;
    }
    
    const newMessages = [
      ...validatedHistory,
      {
        role: 'user',
        content: transcription.text,
      },
    ];
    
    console.log('[Voice Handler] 📝 Building messages. History length:', validatedHistory.length, 'New user message added');
    console.log('[Voice Handler] 📝 User message:', transcription.text);

    const gptOptions = {
      promptType: 'voice_order',
      useTools: true,
      context: {
        userId,
        tenantId,
      },
    };

    console.log('[Voice Handler] 🤖 Calling GPT service with options:', JSON.stringify({
      promptType: gptOptions.promptType,
      useTools: gptOptions.useTools,
      messagesCount: newMessages.length,
    }));

    let gptResult;
    try {
      console.log('[Voice Handler] ⏳ Waiting for GPT response...');
      gptResult = await gptService.chatCompletion(newMessages, gptOptions);
      console.log('[Voice Handler] ✅ GPT response received');
    } catch (error) {
      console.error('[Voice Handler] ❌ GPT error:', error.message);
      console.error('[Voice Handler] ❌ GPT error stack:', error.stack);
      emitError(socket, sessionId, `Order processing failed: ${error.message}`, 'ORDER_PROCESSING_ERROR');
      audioBufferManager.deleteSession(sessionId);
      return;
    }

    const responseContent = gptResult.message.content || 'Đã xử lý yêu cầu của bạn.';

    const responseData = {
      content: responseContent,
    };

    console.log('[Voice Handler] 🔧 Tool calls:', gptResult.toolCalls?.length || 0);
    console.log('[Voice Handler] 🔧 Tool results:', gptResult.toolResults?.length || 0);
    
    if (gptResult.toolCalls && gptResult.toolCalls.length > 0) {
      const toolResults = gptResult.toolResults || [];
      
      // Extract customer info and notes from tool calls (before processing results)
      for (const toolCall of gptResult.toolCalls) {
        if (toolCall.function?.name === 'create_order' || toolCall.function?.name === 'calculate_order_total') {
          try {
            const args = typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments;
            
            // Extract customer info and notes
            if (args.customerName) {
              voiceOrder.session.customerName = args.customerName;
            }
            if (args.customerPhone) {
              voiceOrder.session.customerPhone = args.customerPhone;
            }
            if (args.customerEmail) {
              voiceOrder.session.customerEmail = args.customerEmail;
            }
            if (args.customerGender) {
              voiceOrder.session.customerGender = args.customerGender;
            }
            if (args.notes) {
              voiceOrder.session.notes = args.notes;
            }
            
            console.log('[Voice Handler] 📝 Extracted customer info from tool call:', {
              customerName: args.customerName || null,
              customerPhone: args.customerPhone || null,
              customerEmail: args.customerEmail || null,
              customerGender: args.customerGender || null,
              notes: args.notes || null,
            });
          } catch (parseError) {
            console.warn('[Voice Handler] ⚠️ Failed to parse tool call arguments:', parseError);
          }
        }
      }
      
      for (const toolResult of toolResults) {
        console.log('[Voice Handler] 🔧 Processing tool result:', toolResult.name);
        
        if (toolResult.name === 'calculate_order_total') {
          // Update cart items when order total is calculated
          try {
            const result = JSON.parse(toolResult.content);
            console.log('[Voice Handler] 📦 calculate_order_total result:', JSON.stringify(result, null, 2));
            if (result && result.items && Array.isArray(result.items)) {
              voiceOrder.session.cartItems = result.items;
              voiceOrder.session.total = result.grandTotal || 0;
              // Include cart items in response for UI display
              responseData.cartItems = result.items;
              responseData.total = result.grandTotal || 0;
              console.log('[Voice Handler] ✅ Updated cart items:', result.items.length, 'items, total:', result.grandTotal);
            }
          } catch (parseError) {
            console.warn('[Voice Handler] ❌ Failed to parse calculate_order_total result:', parseError);
          }
        } else if (toolResult.name === 'create_order') {
          try {
            const result = JSON.parse(toolResult.content);
            if (result && result.success && result.order) {
              // Extract order info from formatted order
              responseData.orderId = result.order.id || result.order._id;
              responseData.orderNumber = result.order.orderNumber;
              responseData.total = result.order.totals?.grandTotal || result.paymentSummary?.grandTotal || 0;
              voiceOrder.session.isCompleted = true;
              // Clear cart items after order is created
              voiceOrder.session.cartItems = [];
              voiceOrder.session.total = 0;
              console.log('[Voice Handler] ✅ Order created:', result.order.orderNumber, 'ID:', responseData.orderId);
            }
          } catch (parseError) {
            console.error('[Voice Handler] ❌ Failed to parse create_order result:', parseError);
            console.error('[Voice Handler] ❌ Tool result content:', toolResult.content);
          }
        }
      }
    }
    
    // Always include cart items in response if they exist in session (even if no tool was called this round)
    if (voiceOrder.session.cartItems && voiceOrder.session.cartItems.length > 0) {
      responseData.cartItems = voiceOrder.session.cartItems;
      responseData.total = voiceOrder.session.total;
      console.log('[Voice Handler] 📦 Including existing cart items in response:', voiceOrder.session.cartItems.length, 'items');
    } else {
      console.log('[Voice Handler] ⚠️ No cart items in session');
    }
    
    console.log('[Voice Handler] 📤 Final response data:', JSON.stringify({
      hasContent: !!responseData.content,
      hasCartItems: !!responseData.cartItems,
      cartItemsCount: responseData.cartItems?.length || 0,
      total: responseData.total,
      hasOrderId: !!responseData.orderId,
    }, null, 2));

    console.log('[Voice Handler] 📤 Emitting voice_response event to socket:', socket.id);
    console.log('[Voice Handler] 📤 Socket connected:', socket.connected);
    console.log('[Voice Handler] 📤 Response data size:', JSON.stringify(responseData).length, 'bytes');
    
    try {
      // Emit directly to ensure it's sent
      socket.emit('voice_response', {
        type: 'voice_response',
        sessionId,
        ...responseData,
        timestamp: Date.now(),
      });
      console.log('[Voice Handler] ✅ voice_response event emitted successfully to socket:', socket.id);
    } catch (emitError) {
      console.error('[Voice Handler] ❌ Error emitting voice_response:', emitError);
      console.error('[Voice Handler] ❌ Error stack:', emitError.stack);
      // Still try to emit error to client
      try {
        socket.emit('error', {
          type: 'error',
          sessionId,
          message: 'Failed to emit voice response',
          code: 'EMIT_ERROR',
          timestamp: Date.now(),
        });
      } catch (e) {
        console.error('[Voice Handler] ❌ Failed to emit error event:', e);
      }
    }

    // Build updated messages correctly
    // IMPORTANT: We need to save tool results so GPT can access cart items in future turns
    // Structure: [user message] -> [assistant with tool_calls] -> [tool results] -> [final assistant message]
    
    const updatedMessages = [...newMessages];
    
    // If there were tool calls, we need to reconstruct the conversation flow:
    // 1. Create assistant message with tool_calls (from gptResult.toolCalls)
    // 2. Add tool results after it (from gptResult.toolResults)
    // 3. Add final assistant message (response after tool processing)
    
    if (gptResult.toolCalls && gptResult.toolCalls.length > 0 && gptResult.toolResults && gptResult.toolResults.length > 0) {
      // Validate that all tool_calls have corresponding tool results
      const toolCallIds = new Set(gptResult.toolCalls.map(tc => tc.id || tc.function?.name));
      const toolResultIds = new Set(gptResult.toolResults.map(tr => tr.tool_call_id));
      
      // Check if all tool calls have responses
      const missingToolCallIds = [];
      for (const toolCall of gptResult.toolCalls) {
        const toolCallId = toolCall.id || toolCall.function?.name;
        if (!toolResultIds.has(toolCallId)) {
          missingToolCallIds.push(toolCallId);
        }
      }
      
      if (missingToolCallIds.length > 0) {
        console.warn('[Voice Handler] ⚠️ Some tool calls are missing responses:', missingToolCallIds);
        console.warn('[Voice Handler] ⚠️ Tool call IDs:', Array.from(toolCallIds));
        console.warn('[Voice Handler] ⚠️ Tool result IDs:', Array.from(toolResultIds));
        // Don't save assistant message with tool_calls if not all have responses
        // This prevents the OpenAI API error
        console.warn('[Voice Handler] ⚠️ Skipping assistant message with tool_calls to avoid API error');
      } else {
        // All tool calls have responses, safe to save
        const assistantMessageWithToolCalls = {
          role: 'assistant',
          content: null,
          tool_calls: gptResult.toolCalls, // Already in correct format: [{id, type: 'function', function: {name, arguments}}]
        };
        
        // Add assistant message with tool_calls
        updatedMessages.push(assistantMessageWithToolCalls);
        
        // Add tool results (these must follow the assistant message with tool_calls)
        // Format: [{tool_call_id, role: 'tool', name, content}]
        // Ensure tool results are in the same order as tool_calls
        const orderedToolResults = [];
        for (const toolCall of gptResult.toolCalls) {
          const toolCallId = toolCall.id || toolCall.function?.name;
          const matchingResult = gptResult.toolResults.find(tr => tr.tool_call_id === toolCallId);
          if (matchingResult) {
            orderedToolResults.push(matchingResult);
          }
        }
        
        updatedMessages.push(...orderedToolResults);
        
        console.log('[Voice Handler] 💾 Added assistant message with', gptResult.toolCalls.length, 'tool_calls and', orderedToolResults.length, 'tool results');
      }
    }
    
    // Add final assistant message (response after tool processing)
    updatedMessages.push(gptResult.message);
    
    voiceOrder.session.messages = updatedMessages;
    console.log('[Voice Handler] 💾 Saved messages to session. Total messages:', updatedMessages.length);
    console.log('[Voice Handler] 📋 Last message role:', updatedMessages[updatedMessages.length - 1]?.role);
    console.log('[Voice Handler] 📋 Last message has tool_calls:', !!updatedMessages[updatedMessages.length - 1]?.tool_calls);
    
    // Log tool results for debugging
    if (gptResult.toolResults && gptResult.toolResults.length > 0) {
      gptResult.toolResults.forEach((result, index) => {
        if (result.name === 'calculate_order_total') {
          try {
            const parsed = JSON.parse(result.content);
            console.log('[Voice Handler] 📦 Tool result calculate_order_total has', parsed.items?.length || 0, 'items');
            console.log('[Voice Handler] 📦 Tool result items:', parsed.items?.map(i => `${i.name} x${i.quantity}`).join(', ') || 'none');
          } catch (e) {
            console.warn('[Voice Handler] ⚠️ Failed to parse tool result:', e);
          }
        }
      });
    }

    audioBufferManager.deleteSession(sessionId);

    if (voiceOrder.session.isCompleted && orderSessionId) {
      clearVoiceOrderSession(orderSessionId);
    }
  } catch (error) {
    handleError(socket, error, sessionId);
    if (sessionId) {
      audioBufferManager.deleteSession(sessionId);
    }
  }
};

const handleVoiceCancel = async (socket, data) => {
  try {
    validateMessage(data, ['sessionId']);

    const { sessionId } = data;
    const session = audioBufferManager.getSession(sessionId);
    const orderSessionId = session ? session.orderSessionId : null;

    if (session) {
      audioBufferManager.deleteSession(sessionId);
      clearVoiceOrderSession(orderSessionId);
      emitSuccess(socket, 'voice_cancelled', sessionId, {
        sessionId,
        orderSessionId,
      });
    } else {
      emitError(socket, sessionId, 'Session not found', 'SESSION_NOT_FOUND');
    }
  } catch (error) {
    handleError(socket, error, data?.sessionId);
  }
};

const handleCartUpdate = async (socket, data) => {
  try {
    validateMessage(data, ['orderSessionId', 'items', 'total']);

    const { orderSessionId, items, total } = data;
    const { userId, tenantId } = socket.data;

    if (!orderSessionId) {
      console.warn('[Voice Handler] ⚠️ cart_update received without orderSessionId');
      return;
    }

    // Get or create voice order session
    const voiceOrder = getOrCreateVoiceOrderSession(orderSessionId, socket.id);

    // Update cart items and total in session
    voiceOrder.session.cartItems = items || [];
    voiceOrder.session.total = total || 0;

    console.log('[Voice Handler] 🛒 Cart updated:', items.length, 'items, total:', total);

    // Emit success response
    emitSuccess(socket, 'cart_updated', null, {
      orderSessionId,
      items,
      total,
    });
  } catch (error) {
    console.error('[Voice Handler] ❌ Error in handleCartUpdate:', error);
    handleError(socket, error, null);
  }
};

module.exports = {
  handleVoiceStart,
  handleAudioChunk,
  handleVoiceStop,
  handleVoiceCancel,
  handleCartUpdate,
  clearVoiceOrderSession,
};

