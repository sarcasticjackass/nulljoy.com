// /netlify/functions/abysmia-v2.js

const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

const ASSISTANT_ID = process.env.ABYSMIA_ASSISTANT_ID;

exports.handler = async (event) => {
  try {
    const { message, thread_id } = JSON.parse(event.body);

    let threadId = thread_id;
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      tools: ["retrieval", "function"],
    });

    // Wait for run to complete
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    } while (runStatus.status !== "completed");

    // Get all messages, sort for latest assistant one
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");

    let mood = null;

    // Check for tool_calls
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const call of assistantMsg.tool_calls) {
        if (call.function?.name === "set_emotional_state") {
          try {
            const args = JSON.parse(call.function.arguments);
            mood = args.mood || null;
            console.log("Function call detected — mood set to:", mood);
          } catch (err) {
            console.error("Failed to parse function arguments:", err);
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: assistantMsg.content[0]?.text?.value || "[No response]",
        thread_id: threadId,
        mood,
      }),
    };
  } catch (error) {
    console.error("Netlify handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
