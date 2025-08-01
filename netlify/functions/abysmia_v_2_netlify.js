// /netlify/functions/abysmia-v2.js
// Netlify serverless function to route messages to OpenAI's Assistants API

const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY  // <-- set this in your Netlify environment variables
}));

const ASSISTANT_ID = process.env.ABYSMIA_ASSISTANT_ID; // <-- set this in your env vars

exports.handler = async (event) => {
  try {
    const { message, thread_id } = JSON.parse(event.body);

    // Create or reuse thread
    let threadId = thread_id;
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    // Send user message
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      tools: ["retrieval", "function"]
    });

    // Wait for completion
    let runStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    } while (runStatus.status !== "completed");

    // Get messages
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find(m => m.role === "assistant");

    let mood = null;

    // Check for function calls
    if (lastMessage.content && lastMessage.content.length > 0) {
      const toolCalls = lastMessage.tool_calls || [];
      for (const call of toolCalls) {
        if (call.function?.name === 'set_emotional_state') {
          const args = JSON.parse(call.function.arguments);
          mood = args.mood || null;
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: lastMessage.content[0]?.text?.value || "[No response]",
        thread_id: threadId,
        mood
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
