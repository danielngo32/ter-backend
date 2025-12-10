const { openaiClient, DEFAULT_MODELS, DEFAULT_SETTINGS, isOpenAIAvailable } = require('../config/openai');
const { getToolDefinitions, executeTool } = require('./tools');
const { getVoiceOrderSystemPrompt, getGeneralChatSystemPrompt } = require('./prompts');
const ApiError = require('../utils/apiError');

const chatCompletion = async (messages, options = {}) => {
  if (!isOpenAIAvailable()) {
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new ApiError(400, 'Messages are required and cannot be empty');
  }

  try {
    const model = options.model || DEFAULT_MODELS.chat;
    const temperature = options.temperature !== undefined ? options.temperature : DEFAULT_SETTINGS.temperature;
    const maxTokens = options.maxTokens || DEFAULT_SETTINGS.maxTokens;
    const useTools = options.useTools !== false;
    const promptType = options.promptType || 'general';
    const context = options.context || {};

    let systemPrompt = '';
    if (promptType === 'voice_order') {
      systemPrompt = getVoiceOrderSystemPrompt();
    } else {
      systemPrompt = getGeneralChatSystemPrompt();
    }

    const chatMessages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ];

    const requestParams = {
      model,
      messages: chatMessages,
      temperature,
      max_tokens: maxTokens,
    };

    if (useTools) {
      const tools = getToolDefinitions();
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
        // Use 'auto' instead of 'required' to avoid hanging if GPT can't call tools
        // The prompt should encourage GPT to call calculate_order_total
        requestParams.tool_choice = 'auto';
        console.log('[GPT Service] 🔧 Tools enabled:', tools.length, 'tools, tool_choice:', requestParams.tool_choice);
      }
    }

    console.log('[GPT Service] 📤 Sending request to OpenAI API...');
    console.log('[GPT Service] 📋 Request params:', JSON.stringify({
      model: requestParams.model,
      messagesCount: requestParams.messages.length,
      temperature: requestParams.temperature,
      max_tokens: requestParams.max_tokens,
      hasTools: !!requestParams.tools,
      tool_choice: requestParams.tool_choice,
    }));

    let response;
    try {
      response = await openaiClient.chat.completions.create(requestParams, {
        timeout: DEFAULT_SETTINGS.timeout,
        maxRetries: DEFAULT_SETTINGS.maxRetries,
      });
      console.log('[GPT Service] ✅ Response received from OpenAI');
    } catch (error) {
      console.error('[GPT Service] ❌ OpenAI API error:', error.message);
      console.error('[GPT Service] ❌ Error details:', error.response?.data || error);
      throw error;
    }

    const choice = response.choices[0];
    if (!choice) {
      throw new ApiError(500, 'No response from GPT');
    }

    console.log('[GPT Service] 📥 First response choice:', {
      hasToolCalls: !!choice.message.tool_calls,
      toolCallsCount: choice.message.tool_calls?.length || 0,
      hasContent: !!choice.message.content,
      contentPreview: choice.message.content?.substring(0, 100) || 'N/A',
      finishReason: choice.finish_reason,
    });

    const result = {
      message: choice.message,
      finishReason: choice.finish_reason,
      usage: response.usage,
      model: response.model,
    };

    // Handle tool calls (recursive for multiple rounds)
    let currentMessages = chatMessages;
    let allToolCalls = [];
    let allToolResults = [];
    let totalUsage = { ...response.usage };
    let maxToolRounds = 10;
    let currentRound = 0;
    let currentChoice = choice;

    while (
      currentChoice.message.tool_calls &&
      currentChoice.message.tool_calls.length > 0 &&
      currentRound < maxToolRounds
    ) {
      currentRound++;
      console.log(`[GPT Service] 🔧 Tool call round ${currentRound}/${maxToolRounds}, tool calls:`, currentChoice.message.tool_calls.length);
      
      try {
        console.log('[GPT Service] ⏳ Executing tools...');
        const toolResults = await executeTool(currentChoice.message.tool_calls, context);
        console.log('[GPT Service] ✅ Tools executed, results:', toolResults.length);

        allToolCalls.push(...currentChoice.message.tool_calls);
        allToolResults.push(...toolResults);

        currentMessages = [
          ...currentMessages,
          currentChoice.message,
          ...toolResults,
        ];

        console.log('[GPT Service] 📤 Sending follow-up request to OpenAI...');
        const followUpResponse = await openaiClient.chat.completions.create({
          model,
          messages: currentMessages,
          temperature,
          max_tokens: maxTokens,
          tools: useTools ? getToolDefinitions() : undefined,
          tool_choice: useTools ? 'auto' : undefined, // Changed from 'required' to 'auto'
        }, {
          timeout: DEFAULT_SETTINGS.timeout,
          maxRetries: DEFAULT_SETTINGS.maxRetries,
        });

        console.log('[GPT Service] ✅ Follow-up response received');

        const followUpChoice = followUpResponse.choices[0];
        if (!followUpChoice) {
          console.log('[GPT Service] ⚠️ No choice in follow-up response, breaking');
          break;
        }

        currentChoice = followUpChoice;
        totalUsage = {
          prompt_tokens: totalUsage.prompt_tokens + followUpResponse.usage.prompt_tokens,
          completion_tokens: totalUsage.completion_tokens + followUpResponse.usage.completion_tokens,
          total_tokens: totalUsage.total_tokens + followUpResponse.usage.total_tokens,
        };

        console.log('[GPT Service] 📥 Follow-up choice:', {
          hasToolCalls: !!currentChoice.message.tool_calls,
          toolCallsCount: currentChoice.message.tool_calls?.length || 0,
          hasContent: !!currentChoice.message.content,
          finishReason: currentChoice.finish_reason,
        });

        if (!currentChoice.message.tool_calls || currentChoice.message.tool_calls.length === 0) {
          console.log('[GPT Service] ✅ No more tool calls, breaking loop');
          break;
        }
      } catch (error) {
        console.error('[GPT Service] ❌ Error in tool call loop:', error.message);
        console.error('[GPT Service] ❌ Error stack:', error.stack);
        throw error;
      }
    }

    console.log('[GPT Service] ✅ Tool call processing complete:', {
      rounds: currentRound,
      totalToolCalls: allToolCalls.length,
      totalToolResults: allToolResults.length,
    });

    result.message = currentChoice.message;
    result.finishReason = currentChoice.finish_reason;
    result.usage = totalUsage;
    if (allToolCalls.length > 0) {
      result.toolCalls = allToolCalls;
      result.toolResults = allToolResults;
    }

    console.log('[GPT Service] 📤 Returning result to caller');
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to get chat completion'
      );
    }
    throw new ApiError(500, `GPT chat completion failed: ${error.message}`);
  }
};

const streamChatCompletion = async (messages, options = {}, onChunk = null) => {
  if (!isOpenAIAvailable()) {
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new ApiError(400, 'Messages are required and cannot be empty');
  }

  try {
    const model = options.model || DEFAULT_MODELS.chat;
    const temperature = options.temperature !== undefined ? options.temperature : DEFAULT_SETTINGS.temperature;
    const maxTokens = options.maxTokens || DEFAULT_SETTINGS.maxTokens;
    const useTools = options.useTools !== false;
    const promptType = options.promptType || 'general';

    let systemPrompt = '';
    if (promptType === 'voice_order') {
      systemPrompt = getVoiceOrderSystemPrompt();
    } else {
      systemPrompt = getGeneralChatSystemPrompt();
    }

    const chatMessages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ];

    const requestParams = {
      model,
      messages: chatMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    if (useTools) {
      const tools = getToolDefinitions();
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }
    }

    const stream = await openaiClient.chat.completions.create(requestParams, {
      timeout: DEFAULT_SETTINGS.timeout,
      maxRetries: DEFAULT_SETTINGS.maxRetries,
    });

    let fullContent = '';
    let finishReason = null;
    let toolCalls = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta) {
        if (delta.content) {
          fullContent += delta.content;
          if (onChunk) {
            onChunk(delta.content);
          }
        }
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: toolCall.function?.arguments || '',
                },
              };
            } else {
              toolCalls[index].function.arguments += toolCall.function?.arguments || '';
            }
          }
        }
      }
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }

    return {
      content: fullContent,
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to stream chat completion'
      );
    }
    throw new ApiError(500, `GPT stream failed: ${error.message}`);
  }
};

module.exports = {
  chatCompletion,
  streamChatCompletion,
};

