#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any, no-process-env */

import { ChatOpenAICompletions } from "../chat_models.js";
import { OpenAI as OpenAIClient } from "openai";

// Simple test utility functions
function assert(condition: any, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error("Expected:", expected);
    console.error("Actual:", actual);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting image URL parsing validation tests...\n");

  const chatModel = new ChatOpenAICompletions({
    apiKey: "test-api-key",
    model: "gpt-4o-mini",
  });

  // Test 1: Handle text with single image in streaming delta
  console.log("Test 1: Single image with text in streaming delta");
  {
    const mockDelta = {
      role: "assistant",
      content: "Here is an image: ",
      images: [
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,iVBORw0KGgo...",
            detail: "high"
          }
        }
      ]
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      usage: {},
      choices: [{ index: 0 }]
    } as OpenAIClient.Chat.Completions.ChatCompletionChunk;

    const result = (chatModel as any)._convertCompletionsDeltaToBaseMessageChunk(
      mockDelta,
      mockRawResponse,
      "assistant"
    );

    assert(Array.isArray(result.content), "Content should be an array");
    assertEqual(result.content.length, 2, "Content should have 2 items");
    assertEqual(
      result.content[0],
      { type: "text", text: "Here is an image: " },
      "First item should be text content"
    );
    assertEqual(
      result.content[1],
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgo...",
          detail: "high"
        }
      },
      "Second item should be image content"
    );
    console.log("✓ PASSED\n");
  }

  // Test 2: Handle multiple images in streaming delta
  console.log("Test 2: Multiple images with text in streaming delta");
  {
    const mockDelta = {
      role: "assistant",
      content: "Multiple images: ",
      images: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,image1..." }
        },
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,image2..." }
        }
      ]
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      usage: {},
      choices: [{ index: 0 }]
    } as OpenAIClient.Chat.Completions.ChatCompletionChunk;

    const result = (chatModel as any)._convertCompletionsDeltaToBaseMessageChunk(
      mockDelta,
      mockRawResponse,
      "assistant"
    );

    assert(Array.isArray(result.content), "Content should be an array");
    assertEqual(result.content.length, 3, "Content should have 3 items");
    assertEqual(
      result.content[0],
      { type: "text", text: "Multiple images: " },
      "First item should be text content"
    );
    assertEqual(
      result.content[1],
      { type: "image_url", image_url: { url: "data:image/png;base64,image1..." } },
      "Second item should be first image"
    );
    assertEqual(
      result.content[2],
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,image2..." } },
      "Third item should be second image"
    );
    console.log("✓ PASSED\n");
  }

  // Test 3: Handle images only (empty content) in streaming delta
  console.log("Test 3: Images only (empty content) in streaming delta");
  {
    const mockDelta = {
      role: "assistant",
      content: "",
      images: [
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,onlyimage..." }
        }
      ]
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      usage: {},
      choices: [{ index: 0 }]
    } as OpenAIClient.Chat.Completions.ChatCompletionChunk;

    const result = (chatModel as any)._convertCompletionsDeltaToBaseMessageChunk(
      mockDelta,
      mockRawResponse,
      "assistant"
    );

    assert(Array.isArray(result.content), "Content should be an array");
    assertEqual(result.content.length, 1, "Content should have 1 item");
    assertEqual(
      result.content[0],
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,onlyimage..." } },
      "Item should be image content only"
    );
    console.log("✓ PASSED\n");
  }

  // Test 4: Maintain backward compatibility for responses without images
  console.log("Test 4: Backward compatibility - responses without images");
  {
    const mockDelta = {
      role: "assistant",
      content: "Just text response"
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      usage: {},
      choices: [{ index: 0 }]
    } as OpenAIClient.Chat.Completions.ChatCompletionChunk;

    const result = (chatModel as any)._convertCompletionsDeltaToBaseMessageChunk(
      mockDelta,
      mockRawResponse,
      "assistant"
    );

    assertEqual(typeof result.content, "string", "Content should be a string");
    assertEqual(result.content, "Just text response", "Content should match original text");
    console.log("✓ PASSED\n");
  }

  // Test 5: Handle invalid image objects gracefully
  console.log("Test 5: Handle invalid image objects gracefully");
  {
    const mockDelta = {
      role: "assistant",
      content: "Text with invalid image: ",
      images: [
        {
          type: "invalid_type",
          image_url: { url: "data:image/png;base64,invalid..." }
        },
        {
          type: "image_url",
          // Missing image_url field
        },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,valid..." }
        }
      ]
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      usage: {},
      choices: [{ index: 0 }]
    } as OpenAIClient.Chat.Completions.ChatCompletionChunk;

    const result = (chatModel as any)._convertCompletionsDeltaToBaseMessageChunk(
      mockDelta,
      mockRawResponse,
      "assistant"
    );

    assert(Array.isArray(result.content), "Content should be an array");
    assertEqual(result.content.length, 2, "Content should have 2 items (text + valid image only)");
    assertEqual(
      result.content[0],
      { type: "text", text: "Text with invalid image: " },
      "First item should be text content"
    );
    assertEqual(
      result.content[1],
      { type: "image_url", image_url: { url: "data:image/png;base64,valid..." } },
      "Second item should be valid image only"
    );
    console.log("✓ PASSED\n");
  }

  // Test 6: Non-streaming message conversion with images
  console.log("Test 6: Non-streaming message conversion with images");
  {
    const mockMessage = {
      role: "assistant",
      content: "Here is an image: ",
      images: [
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,iVBORw0KGgo...",
            detail: "high"
          }
        }
      ]
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      model: "gpt-4o-mini",
      usage: {}
    } as OpenAIClient.Chat.Completions.ChatCompletion;

    const result = (chatModel as any)._convertCompletionsMessageToBaseMessage(
      mockMessage,
      mockRawResponse
    );

    assert(Array.isArray(result.content), "Content should be an array");
    assertEqual(result.content.length, 2, "Content should have 2 items");
    assertEqual(
      result.content[0],
      { type: "text", text: "Here is an image: " },
      "First item should be text content"
    );
    assertEqual(
      result.content[1],
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgo...",
          detail: "high"
        }
      },
      "Second item should be image content"
    );
    console.log("✓ PASSED\n");
  }

  // Test 7: Non-streaming backward compatibility
  console.log("Test 7: Non-streaming backward compatibility - responses without images");
  {
    const mockMessage = {
      role: "assistant",
      content: "Just text response"
    };

    const mockRawResponse = {
      id: "chatcmpl-test",
      model: "gpt-4o-mini",
      usage: {}
    } as OpenAIClient.Chat.Completions.ChatCompletion;

    const result = (chatModel as any)._convertCompletionsMessageToBaseMessage(
      mockMessage,
      mockRawResponse
    );

    assertEqual(typeof result.content, "string", "Content should be a string");
    assertEqual(result.content, "Just text response", "Content should match original text");
    console.log("✓ PASSED\n");
  }

  console.log("🎉 All tests passed! Image URL parsing fix is working correctly.");
}

// Run the tests
runTests().catch((error) => {
  console.error("❌ Tests failed:", error.message);
  process.exit(1);
});
