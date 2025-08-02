const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ABYSMIA_ASSISTANT_ID;

console.log("🔧 OpenAI SDK loaded:", typeof openai === "object");

exports.handler = async (event) => {
  try {
    const { message, thread_id } = JSON.parse(event.body);
    
    console.log("=== DEBUG START ===");
    console.log("Received message:", message);
    console.log("Received thread_id:", thread_id, "Type:", typeof thread_id);

    let threadId = thread_id;
    
    // Handle null, undefined, empty string, etc.
    if (!threadId || threadId === 'null' || threadId === 'undefined') {
      console.log("Creating new thread...");
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      console.log("New thread created:", threadId);
    } else {
      console.log("Using existing thread:", threadId);
    }

    // Safety check
    if (!threadId) {
      throw new Error("ThreadId is still undefined after creation attempt");
    }

    console.log("Final threadId before message creation:", threadId);

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });

    console.log("Message created successfully");

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      tools: [
        { type: "file_search" },
        { 
          type: "function",
          function: {
            name: "set_emotional_state",
            description: "Set or change the AI's emotional state/mood",
            parameters: {
              type: "object",
              properties: {
                mood: {
                  type: "string",
                  description: "The emotional state"
                }
              },
              required: ["mood"]
            }
          }
        }
      ]
    });

    console.log("Run created:", run.id, "ThreadId used:", threadId);

    // Wait for the run to finish - using alternative approach
    let runStatus;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Retrieving run status with threadId:", threadId, "runId:", run.id);
      
      try {
        // Try alternative API call structure
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        console.log("Run status:", runStatus.status);
      } catch (retrieveError) {
        console.error("Retrieve error:", retrieveError.message);
        
        // Fallback: try listing runs and finding ours
        console.log("Trying fallback method...");
        const runs = await openai.beta.threads.runs.list(threadId);
        runStatus = runs.data.find(r => r.id === run.id);
        
        if (!runStatus) {
          throw new Error("Could not find run in list");
        }
        console.log("Fallback run status:", runStatus.status);
      }
    } while (runStatus.status !== "completed" && runStatus.status !== "failed");

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