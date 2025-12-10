const { openaiClient, DEFAULT_MODELS, DEFAULT_SETTINGS, isOpenAIAvailable } = require('../config/openai');
const ApiError = require('../utils/apiError');

const createEmbeddings = async (input, options = {}) => {
  if (!isOpenAIAvailable()) {
    throw new ApiError(503, 'OpenAI service is not available. Please configure OPENAI_API_KEY.');
  }

  if (!input) {
    throw new ApiError(400, 'Input is required');
  }

  const isArray = Array.isArray(input);
  const texts = isArray ? input : [input];

  if (texts.length === 0) {
    throw new ApiError(400, 'Input cannot be empty');
  }

  for (const text of texts) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ApiError(400, 'All input texts must be non-empty strings');
    }
  }

  try {
    const model = options.model || DEFAULT_MODELS.embeddings;
    const encodingFormat = options.encoding_format || 'float';
    const dimensions = options.dimensions || null;

    const params = {
      model,
      input: texts,
      encoding_format: encodingFormat,
    };

    if (dimensions) {
      params.dimensions = dimensions;
    }

    const response = await openaiClient.embeddings.create(params);

    const result = {
      data: response.data.map((item) => ({
        index: item.index,
        embedding: item.embedding,
      })),
      model: response.model,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        total_tokens: response.usage.total_tokens,
      },
    };

    if (!isArray) {
      return {
        embedding: result.data[0].embedding,
        model: result.model,
        usage: result.usage,
      };
    }

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.response) {
      throw new ApiError(
        error.response.status || 500,
        error.response.data?.error?.message || 'Failed to create embeddings'
      );
    }
    throw new ApiError(500, `Embeddings generation failed: ${error.message}`);
  }
};

const cosineSimilarity = (embedding1, embedding2) => {
  if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
    throw new ApiError(400, 'Both embeddings must be arrays');
  }

  if (embedding1.length !== embedding2.length) {
    throw new ApiError(400, 'Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
};

const findMostSimilar = (queryEmbedding, candidateEmbeddings, topK = 5) => {
  if (!Array.isArray(queryEmbedding)) {
    throw new ApiError(400, 'Query embedding must be an array');
  }

  if (!Array.isArray(candidateEmbeddings) || candidateEmbeddings.length === 0) {
    throw new ApiError(400, 'Candidate embeddings must be a non-empty array');
  }

  const similarities = candidateEmbeddings.map((candidate, index) => {
    const similarity = cosineSimilarity(queryEmbedding, candidate);
    return { index, similarity };
  });

  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, topK);
};

module.exports = {
  createEmbeddings,
  cosineSimilarity,
  findMostSimilar,
};

