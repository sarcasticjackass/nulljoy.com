const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ABYSMIA_ASSISTANT_ID;

console.log("🔧 OpenAI SDK loaded:", typeof openai === "object");

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
  tools: [
    { type: "retrieval" },
    { type: "function" }
  ]
});


    // Wait for the run to finish
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    } while (runStatus.status !== "completed");

    // Get messages and look for assistant response
    const messages = await openai.beta.threads.messages.list(threadId);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");

    let mood = null;
    let reply = "[No response]";

    // Try parsing reply content safely
    if (assistantMsg?.content) {
      if (Array.isArray(assistantMsg.content)) {
        reply = assistantMsg.content[0]?.text?.value || reply;
      } else if (typeof assistantMsg.content === "string") {
        reply = assistantMsg.content;
      }
    }

    // Check for tool calls (mood change)
    if (assistantMsg?.tool_calls?.length > 0) {
      for (const call of assistantMsg.tool_calls) {
        if (call.function?.name === "set_emotional_state") {
          try {
            const args = JSON.parse(call.function.arguments);
            mood = args.mood || null;
            console.log("Mood function called:", mood);
          } catch (err) {
            console.error("Function arg parse error:", err);
          }
        }
      }
    }

    // Fallback if no reply but a mood was set
    if ((!reply || reply === "[No response]") && mood) {
      reply = `[Silent mood shift to: ${mood}]`;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        thread_id: threadId,
        mood,
      }),
    };
  } catch (error) {
    console.error("Abysmia function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
