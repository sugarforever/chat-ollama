import { test, expect } from "@jest/globals";
import { ChatOpenAICompletions } from "../chat_models.js";
import { AIMessageChunk } from "@langchain/core/messages";

test("Test streaming response with image_url parsing", () => {
  const chat = new ChatOpenAICompletions({
    model: "gpt-4o-mini",
    maxTokens: 100,
  });

  // Mock delta with images field (as seen in OpenRouter API responses)
  const mockDelta = {
    role: "assistant",
    content: "Here is an image for you: ",
    images: [
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAgAElEQVR4nGT9W7aky3EjDAIWh6K61j//4fQwehL9VKtKEkWeMPQDAPM46hR...",
          detail: "high"
        }
      }
    ]
  };

  const mockRawResponse = {
    id: "test-id",
    usage: { completion_tokens: 10, prompt_tokens: 5, total_tokens: 15 },
    choices: [{ index: 0 }]
  };

  // Test the _convertCompletionsDeltaToBaseMessageChunk method
  const chunk = chat._convertCompletionsDeltaToBaseMessageChunk(
    mockDelta,
    mockRawResponse as any,
    "assistant"
  );

  // Verify the chunk is an AIMessageChunk
  expect(chunk).toBeInstanceOf(AIMessageChunk);

  // Verify the content is an array with both text and image
  expect(Array.isArray(chunk.content)).toBe(true);
  expect(chunk.content).toHaveLength(2);

  // Verify text content
  const textContent = chunk.content.find((item: any) => item.type === "text");
  expect(textContent).toBeDefined();
  expect(textContent.text).toBe("Here is an image for you: ");

  // Verify image content
  const imageContent = chunk.content.find((item: any) => item.type === "image_url");
  expect(imageContent).toBeDefined();
  expect(imageContent.image_url).toBeDefined();
  expect(imageContent.image_url.url).toBe(mockDelta.images[0].image_url.url);
  expect(imageContent.image_url.detail).toBe("high");
});

test("Test streaming response without images field", () => {
  const chat = new ChatOpenAICompletions({
    model: "gpt-4o-mini",
    maxTokens: 100,
  });

  // Mock delta without images field (normal case)
  const mockDelta = {
    role: "assistant",
    content: "This is a text-only response.",
  };

  const mockRawResponse = {
    id: "test-id",
    usage: { completion_tokens: 5, prompt_tokens: 3, total_tokens: 8 },
    choices: [{ index: 0 }]
  };

  // Test the _convertCompletionsDeltaToBaseMessageChunk method
  const chunk = chat._convertCompletionsDeltaToBaseMessageChunk(
    mockDelta,
    mockRawResponse as any,
    "assistant"
  );

  // Verify the chunk is an AIMessageChunk
  expect(chunk).toBeInstanceOf(AIMessageChunk);

  // Verify the content is a string (not converted to array)
  expect(typeof chunk.content).toBe("string");
  expect(chunk.content).toBe("This is a text-only response.");
});

test("Test streaming response with empty content and images", () => {
  const chat = new ChatOpenAICompletions({
    model: "gpt-4o-mini",
    maxTokens: 100,
  });

  // Mock delta with empty content but with images
  const mockDelta = {
    role: "assistant",
    content: "",
    images: [
      {
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
        }
      }
    ]
  };

  const mockRawResponse = {
    id: "test-id",
    usage: { completion_tokens: 0, prompt_tokens: 5, total_tokens: 5 },
    choices: [{ index: 0 }]
  };

  // Test the _convertCompletionsDeltaToBaseMessageChunk method
  const chunk = chat._convertCompletionsDeltaToBaseMessageChunk(
    mockDelta,
    mockRawResponse as any,
    "assistant"
  );

  // Verify the chunk is an AIMessageChunk
  expect(chunk).toBeInstanceOf(AIMessageChunk);

  // Verify the content is an array with just the image (no text since content was empty)
  expect(Array.isArray(chunk.content)).toBe(true);
  expect(chunk.content).toHaveLength(1);

  // Verify image content
  const imageContent = chunk.content.find((item: any) => item.type === "image_url");
  expect(imageContent).toBeDefined();
  expect(imageContent.image_url.url).toBe(mockDelta.images[0].image_url.url);
});